# This script imports PTS zip files for DAC.  It is modified from
# the slycat-csv-parser.  This parser uploads a PTS CSV/META zip
# file then pushes the stored files to the previous CSV/META parsers.
#
# S. Martin
# 7/14/2017

# computation and array manipulation
import numpy
from scipy import spatial

# web server interaction
import slycat.web.server

# file manipulation
import io
import zipfile
import os

# reading tdms files
import nptdms
import pandas as pd

# background thread does all the work on the server
import threading
import traceback

# for dac_compute_coords.py and dac_upload_model.py
import imp

import cherrypy

# go through all tdms files and make of record of each shot
# filter out channels that have < MIN_TIME_STEPS
# filter out shots that have < MIN_CHANNELS
def filter_shots (database, model, dac_error, parse_error_log, tdms_ref,
                  MIN_TIME_STEPS, MIN_CHANNELS, start_progress, end_progress):

    shot_meta = []          # meta data for shot
    shot_data = []          # channel data for shot

    # set up file progress indicator
    curr_file = start_progress
    inc_file = (end_progress - start_progress) / len(tdms_ref)

    for tdms_file in tdms_ref:

        # get root meta data properties, same for every row of table
        root_properties = pd.DataFrame(tdms_file.properties, index=[0]).add_suffix(' [Root]')

        for group in tdms_file.groups():

            # name shot/channel for potential errors
            shot_name = str(tdms_file.properties['name']) + '_' + group.name

            # get channels for group
            group_channels = tdms_file[group.name].channels()

            # compile channel data in a list
            channel_data = []

            for channel_object in group_channels:

                # each channel is a dictionary containing name, unit, and time data
                channel = {}

                # get time information for channel
                channel['wf_samples'] = channel_object.properties.get('wf_samples', None)
                channel['wf_start_offset'] = channel_object.properties.get('wf_start_offset', None)
                channel['wf_increment'] = channel_object.properties.get('wf_increment', None)
                channel['wf_unit'] = channel_object.properties.get('wf_unit', None)

                # get channel name
                channel['name'] = channel_object.name

                # get channel unit
                channel['unit'] = channel_object.properties.get('Unit', None)

                # get actual time series
                channel['data'] = channel_object.data

                # check that channel is not empty
                if channel['wf_samples'] is None:

                    parse_error_log = dac_error.update_parse_log(database, model, parse_error_log,
                        "Progress", 'Discarding channel "' + channel['name'] + '" in shot "' +
                        shot_name + '" -- empty time series.')

                    continue

                # check that channel has enough time steps
                if channel['wf_samples'] < MIN_TIME_STEPS:

                    parse_error_log = dac_error.update_parse_log(database, model, parse_error_log,
                        "Progress", 'Discarding channel "' + channel['name'] + '" in shot "' +
                        shot_name + '" -- less than ' + str(MIN_TIME_STEPS) + ' time steps.')

                    continue

                # a shot contains a list of channel data
                channel_data.append(channel)

            # check that shot has enough channels
            if len(channel_data) < MIN_CHANNELS:

                parse_error_log = dac_error.update_parse_log(database, model, parse_error_log,
                    "Progress", 'Discarding shot "' + shot_name + '" -- less than ' +
                     str(MIN_CHANNELS) + ' channels.')

                continue

            # keep track of channel names and time data
            shot_data.append(channel_data)

            # gather meta data:

            # get group meta data properties, different for each row of table
            group_properties = pd.DataFrame(tdms_file[group.name].properties, index=[0]).add_suffix(' [Group]')

            # combine root and group properties
            group_root_properties = group_properties.join(root_properties, sort=False)

            # add shot index
            shot = pd.DataFrame([group.name], index=[0], columns=['Group'])
            group_root_shot_properties = group_root_properties.join(shot, sort=False)

            # make unique index to row from name and group number (shot)
            group_root_shot_properties['Index (Name_Group)'] = group_root_shot_properties['name [Root]'].astype(str) + \
                                                               '_' + group_root_shot_properties['Group']
            group_df = group_root_shot_properties.set_index('Index (Name_Group)')

            shot_meta.append(group_df)

        # update file progress indicator
        slycat.web.server.put_model_parameter(database, model, "dac-polling-progress",
            ["Extracting ...", curr_file + inc_file])
        curr_file = curr_file + inc_file

    parse_error_log = dac_error.update_parse_log(database, model, parse_error_log, "Progress",
        'Filtered TDMS shots by minimum number of time steps (' + str(MIN_TIME_STEPS) +
        ') and minimum number of channels (' + str(MIN_CHANNELS) + ').')

    return parse_error_log, shot_meta, shot_data


# routine to find minimal channel list for list of shots, order preserving
# also returns maximum (union) of channels, for error messages, not order preserving
def intersect_channels (shot_channels):

    # assume empty intersection
    min_chan = []
    max_chan = []
    channel_counts = []

    # check for non-empty list of shots
    if len(shot_channels) > 0:

        # go through each shot and look at the channels available
        min_chan = shot_channels[0]
        max_chan = shot_channels[0]
        for i in range(0, len(shot_channels)):

            # get intersection and union of channels
            min_chan = [channel for channel in min_chan if channel in shot_channels[i]]
            max_chan = list(set(max_chan) | set(shot_channels[i]))

            # count number of channels for each shot
            channel_counts.append(len(shot_channels[i]))

    # only care about minimum unique values for channel counts
    min_channel_counts = min(numpy.unique(channel_counts))

    return min_chan, max_chan, min_channel_counts


# routine to reduce shot data to smallest channel minimum by order
# if can't reduce, changes SHOT_TYPE to 'General'
def reduce_shot_channels (database, model, dac_error, parse_error_log, first_shot_name,
                          shot_channels, shot_data, min_channels, min_channel_count,
                          SHOT_TYPE, shot_type_min):

    num_shots = len(shot_channels)

    if min_channel_count >= shot_type_min:

        parse_error_log = dac_error.update_parse_log (database, model, parse_error_log, "Progress",
            'Found ' + str(min_channel_count) + ' channels for ' + SHOT_TYPE + ' testing -- using "' +
            first_shot_name + '" for channel names.')

        # reduce channels to consistent number
        for i in range(0, num_shots):
            shot_data[i] = shot_data[i][0:min_channel_count]

        min_channels = shot_channels[0][0:min_channel_count]

    else:

        parse_error_log = dac_error.update_parse_log(database, model, parse_error_log, "Progress",
            'Found less than ' + str(shot_type_min) + ' channels per shot for ' +
            SHOT_TYPE + ' testing, reverting to General case.')

        SHOT_TYPE = 'General'

    return parse_error_log, shot_data, min_channels, SHOT_TYPE


# filter out channels to obtain a consistent number
# of channels per shot and get channel names
def filter_channels (database, model, dac_error, parse_error_log, first_shot_name, shot_data, SHOT_TYPE):

    # get channel names
    shot_channels = [[channel['name'] for channel in shot] for shot in shot_data]

    # get list of channels that occur in every shot
    min_channels, all_channels, min_channel_count = intersect_channels(shot_channels)

    # in the overvoltage case, we use channel order and assume at least two channels
    if SHOT_TYPE == 'Overvoltage':
        parse_error_log, shot_data, min_channels, SHOT_TYPE = \
            reduce_shot_channels(database, model, dac_error, parse_error_log, first_shot_name,
                shot_channels, shot_data, min_channels, min_channel_count, SHOT_TYPE, 2)

    # in the sprytron case, we use channel order and assume at least six channels
    if SHOT_TYPE == 'Sprytron':
        parse_error_log, shot_data, min_channels, SHOT_TYPE = \
            reduce_shot_channels(database, model, dac_error, parse_error_log, first_shot_name,
                shot_channels, shot_data, min_channels, min_channel_count, SHOT_TYPE, 6)

    # in the general case, we discard channels not present in all shots
    num_shots = len(shot_channels)
    if SHOT_TYPE == 'General':
        for channel in all_channels:
            if channel not in min_channels:

                parse_error_log = dac_error.update_parse_log(database, model, parse_error_log, "Progress",
                    'Discarding channel "' + channel + '" -- not present in all shots.')

                # discard channel from all shots
                for i in range(0, num_shots):

                    # replace old channel data
                    new_channel = []
                    new_data = []

                    for j in range(0, len(shot_channels[i])):
                        if shot_channels[i][j] != channel:
                            new_channel.append(shot_channels[i][j])
                            new_data.append(shot_data[i][j])

                    # update all channel information
                    shot_channels[i] = new_channel
                    shot_data[i] = new_data

    parse_error_log = dac_error.update_parse_log(database, model, parse_error_log, "Progress",
        "Filtered TDMS channels to least common number per shot.")

    return parse_error_log, min_channels, shot_data


# get channel units from consensus or inference via channel names
def infer_channel_units (database, model, dac_error, parse_error_log, first_shot_name, channel_names,
                         shot_units, INFER_CHANNEL_UNITS, SHOT_TYPE):

    num_channels = len(channel_names)
    num_shots = len(shot_units)
    channel_units = []

    # check for consistent channel units
    for i in range(0, num_channels):

        # flag for inconsistent units
        inconsistent_units = False

        # get units of first shot in this channel
        unit_0 = shot_units[0][i]

        # compare units of each shot in list
        for j in range(0, num_shots):
            unit_j = shot_units[j][i]
            if unit_j != unit_0:
                inconsistent_units = True

        # go with first unit assignment if inconsistent units found
        if inconsistent_units:

            parse_error_log = dac_error.update_parse_log(database, model, parse_error_log, "Progress",
                'Inconsistent units found for channel "' + channel_names[i] + '", using "' +
                str('Not Given' if unit_0 is None else unit_0) + '" from shot "' +
                first_shot_name + '".')

        # if missing unit, infer from name using Jeremy's method
        if unit_0 is None and INFER_CHANNEL_UNITS:

            if channel_names[i].find('I') >= 0:
                unit_0 = 'Amps'
            elif channel_names[i].find('Current') >= 0:
                unit_0 = 'Amps'
            else:
                unit_0 = 'Volts'

        channel_units.append(unit_0)

    # double check units using number of channels for Overvoltage type
    if SHOT_TYPE == 'Overvoltage':

        # if units don't agree with expected units issue warning
        if not channel_units[0:2] == ['Amps', 'Volts']:

            parse_error_log = dac_error.update_parse_log(database, model, parse_error_log, "Progress",
                'Warning -- units different from expected units for Overvoltage testing.')

    # double check units for Sprytron type
    if SHOT_TYPE == 'Sprytron':

        # if units don't agree with expected units issue warning
        if not channel_units[0:6] == ['Amps', 'Volts', 'Volts', 'Volts', 'Amps', 'Volts']:

            parse_error_log = dac_error.update_parse_log(database, model, parse_error_log, "Progress",
                'Warning -- units different from expected units for Sprytron testing.')

    # change None type to 'Not Given' for final output
    channel_units = ['Not Given' if unit is None else unit for unit in channel_units]

    parse_error_log = dac_error.update_parse_log(database, model, parse_error_log, "Progress",
        "Determined channel units for TDMS data.")

    return parse_error_log, channel_units


# makes a time vector from start, increment, and samples
def make_time_vector (shot_time):

    # shot_time is [start, increment, samples]
    start = shot_time[0]
    increment = shot_time[1]
    samples = int(shot_time[2])

    # construct time vector
    time_vector = []
    for i in range(0, samples):
        time_vector.append(start + increment*i)

    return time_vector


# construct and intersect/union all time vectors using a vector of shot times
def combine_time_vectors (database, model, start_progress, end_progress, shot_times, TIME_STEP_TYPE):

    num_shots = len(shot_times)
    int_progress = end_progress - start_progress

    # go through each shot and intersect or union time vectors
    time_vector = make_time_vector(shot_times[0])
    for i in range(0, num_shots):

        time_i = make_time_vector(shot_times[i])

        if TIME_STEP_TYPE == 'Intersection':
            time_vector = numpy.intersect1d(time_vector, time_i)
        else:
            time_vector = numpy.union1d(time_vector, time_i)

        # shot progress
        if i % 10 == 0:
            slycat.web.server.put_model_parameter(database, model, "dac-polling-progress",
                ["Computing ...", start_progress + int_progress / num_shots * (i + 1.0)])

    return time_vector


# normalize time steps using either intersection or union
# note shot_data, channel_names, and channel_units might be changed if
# a channel is removed because it doesn't have enough time steps
def normalize_time_steps (database, model, dac_error, parse_error_log, shot_data, channel_names,
                          channel_units, MIN_TIME_STEPS, TIME_STEP_TYPE, start_progress, end_progress):

    # get shot time interval data
    shot_times = [[[channel['wf_start_offset'], channel['wf_increment'], channel['wf_samples']]
                   for channel in shot] for shot in shot_data]

    # check that time steps are the same for every included channel
    num_shots = len(shot_times)
    num_channels = len(channel_names)

    # progress per channel
    inc_progress = (end_progress - start_progress) / num_channels

    # form time steps (list of time vectors) for DAC
    time_steps = []

    for i in range(0, num_channels):

        time_0 = shot_times[0][i]
        inconsistent_time_steps = False

        # compare time for first shot with time for remaining shots
        for j in range(0, num_shots):
            time_j = shot_times[j][i]
            if time_j != time_0:
                inconsistent_time_steps = True

        # if inconsistent time steps warn user then use intersection or union
        if inconsistent_time_steps:

            parse_error_log = dac_error.update_parse_log(database, model, parse_error_log, "Progress",
                'Found inconsistent time steps for channel "' + channel_names[i] +
                '" -- normalizing time steps using ' + TIME_STEP_TYPE + '.')

            if TIME_STEP_TYPE == 'Union':

                parse_error_log = dac_error.update_parse_log(database, model, parse_error_log, "Progress",
                    'Warning -- Union introduces artificial data from interpolation and extrapolation.')

            start_combine = start_progress + inc_progress * i
            end_combine = start_combine + inc_progress

            # form union or intersection time vector
            time_steps.append(combine_time_vectors(database, model, start_combine, end_combine,
                numpy.array(shot_times)[:, i], TIME_STEP_TYPE))

        else:

            # add time vector to time steps list
            time_steps.append(make_time_vector(shot_times[0][i]))

    # check if any time_steps have been reduced below MIN_TIME_STEPS threshold
    # use reverse order because we may be removing items from the data lists
    for i in range(num_channels - 1, -1, -1):

        if len(time_steps[i]) < MIN_TIME_STEPS:

            parse_error_log = dac_error.update_parse_log(database, model, parse_error_log, "Progress",
                'Discarding channel "' + channel_names[i] + '" -- less than ' +
                str(MIN_TIME_STEPS) + ' time steps.')

            # discard channel from all shots
            for j in range(0, num_shots):
                # remove channel i from data, time steps, names, and units
                shot_data[j].pop(i)
                time_steps.pop(i)
                channel_names.pop(i)
                channel_units.pop(i)

    parse_error_log = dac_error.update_parse_log(database, model, parse_error_log, "Progress",
        "Normalized time steps for TDMS data.")

    return parse_error_log, time_steps, shot_data, channel_names, channel_units


# get channel time units from data or time steps and seconds inference
def infer_channel_time_units (database, model, dac_error, parse_error_log, first_shot_name,
                              shot_time_units, time_steps, INFER_SECONDS, channel_names):

    num_channels = len(channel_names)
    num_shots = len(shot_time_units)
    channel_time_units = []

    # check for consistent channel units
    for i in range(0, num_channels):

        # flag for inconsistent units
        inconsistent_units = False

        # get units of first shot in this channel
        unit_0 = shot_time_units[0][i]

        # compare units of each shot in list
        for j in range(0, num_shots):
            unit_j = shot_time_units[j][i]
            if unit_j != unit_0:
                inconsistent_units = True

        # go with first unit assignment if inconsistent units found
        if inconsistent_units:

            parse_error_log = dac_error.update_parse_log(database, model, parse_error_log, "Progress",
                'Inconsistent time units found for channel "' + channel_names[i] + '", using "' +
                str('Not Given' if unit_0 is None else unit_0) + '" from shot "' +
                first_shot_name + '".')

        # if missing unit, infer secons and time steps magnitude
        if unit_0 is None and INFER_SECONDS:

            # change unit_0 to seconds
            unit_0 = 'Seconds'

            # check if magnitude of time steps is in micro-seconds
            time_magnitude = (time_steps[i][-1] - time_steps[i][0]) * 10**6
            if time_magnitude > 0 and time_magnitude < 1000:

                # change units to microseconds
                unit_0 = 'Microseconds'

                # change actual time values to microseconds
                time_steps[i] = numpy.multiply(time_steps[i], 10**6)

        channel_time_units.append(unit_0)

    # change None type to 'Not Given' for final output
    channel_time_units = ['Not Given' if unit is None else unit for unit in channel_time_units]

    parse_error_log = dac_error.update_parse_log(database, model, parse_error_log, "Progress",
        "Determined TDMS channel time units.")

    return parse_error_log, channel_time_units, time_steps


# construct DAC variables to match time steps
def construct_variables (database, model, dac_error, parse_error_log, shot_data,
                         time_steps, start_progress, end_progress):

    # get shot time interval data
    shot_times = [[[channel['wf_start_offset'], channel['wf_increment'], channel['wf_samples']]
                   for channel in shot] for shot in shot_data]

    # check that time steps are the same for every included channel
    num_shots = len(shot_times)
    num_channels = len(shot_times[0])

    # progress per channel
    inc_progress = (end_progress - start_progress) / num_channels

    # variables contains a list of matrices for DAC
    variables = []
    var_dist = []

    # get variables for each channel
    for i in range(0, num_channels):

        # each channel has one array of variables
        channel_vars = []

        start_shot = start_progress + inc_progress * i
        end_shot = start_shot + inc_progress
        int_shot = (end_shot - start_shot)

        for j in range(0, num_shots):

            # start with NaNs for entire variable
            var_j = numpy.array([float('NaN')] * len(time_steps[i]))

            # get time steps and variable for this channel and shot
            time_j = make_time_vector(shot_times[j][i])
            data_j = numpy.array(shot_data[j][i]['data'])

            # get indices of time_j in time_steps
            inds_in_time_steps = numpy.where(numpy.isin(time_steps[i], time_j) == True)[0]
            inds_in_time_j = numpy.where(numpy.isin(time_j, time_steps[i]) == True)[0]

            # fill in variable with available data
            var_j[inds_in_time_steps] = data_j[inds_in_time_j]

            # interpolate or extrapolate for any NaNs
            nan_inds = numpy.isnan(var_j)
            if numpy.any(nan_inds):

                # returns time indices of logical array
                time = lambda z: z.nonzero()[0]

                # interpolates between values, extrapolates past ends
                var_j[nan_inds] = numpy.interp(time(nan_inds), time(~nan_inds), var_j[~nan_inds])

            # add this variable to our channel list
            channel_vars.append(list(var_j))

            # shot progress
            if j % 10 == 0:
                slycat.web.server.put_model_parameter(database, model, "dac-polling-progress",
                    ["Computing ...", start_shot + int_shot / num_shots * (j + 1.0)])

        # add the channel variable matrix to variable list
        variables.append(numpy.array(channel_vars))

        # create pairwise distance matrix
        dist_i = spatial.distance.pdist(variables[-1])
        var_dist.append(spatial.distance.squareform(dist_i))

    parse_error_log = dac_error.update_parse_log(database, model, parse_error_log, "Progress",
        "Extended/contracted TDMS channels to match time steps.")

    return parse_error_log, variables, var_dist


def parse_tdms(database, model, input, files, aids, **kwargs):

    """
    uploads a set of .tdms files and parses them for the database
    :param database: slycat.web.server.database.couchdb.connect()
    :param model: database.get("model", self._mid)
    :param input: boolean
    :param files: files to be parsed
    :param aids: normally artifact ID, but we are using it to pass parameters from the UI
    :param kwargs:
    """

    # import error handling from source
    dac_error = imp.load_source('dac_error_handling',
                           os.path.join(os.path.dirname(__file__), 'py/dac_error_handling.py'))

    dac_error.log_dac_msg("TDMS parser started.")

    # get user parameters
    MIN_TIME_STEPS = int(aids[0])
    MIN_CHANNELS = int(aids[1])
    SHOT_TYPE = aids[2]
    TIME_STEP_TYPE = aids[3]
    INFER_CHANNEL_UNITS = aids[4]
    INFER_SECONDS = aids[5]

    # keep a parsing error log to help user correct input data
    # (each array entry is a string)
    parse_error_log = dac_error.update_parse_log (database, model, [], "Progress", "Notes:")

    # count number of tdms files
    num_files = len(files)
    parse_error_log = dac_error.update_parse_log(database, model, parse_error_log, "Progress",
                                       "Uploaded " + str(num_files) + " file(s).")

    # push progress for wizard polling to database
    slycat.web.server.put_model_parameter(database, model, "dac-polling-progress", ["Extracting ...", 10.0])

    # treat each uploaded file as bitstream
    file_object = []
    tdms_ref = []

    for i in range(0,num_files):

        try:

            file_object.append(io.BytesIO(files[i]))
            tdms_ref.append(nptdms.TdmsFile(file_object[i]))

        except Exception as e:

            dac_error.quit_raise_exception(database, model, parse_error_log,
                                           "Couldn't read TDMS file.")

    # start actual parsing as a thread
    stop_event = threading.Event()
    thread = threading.Thread(target=parse_tdms_thread, args=(database, model, tdms_ref,
                              MIN_TIME_STEPS, MIN_CHANNELS, SHOT_TYPE, TIME_STEP_TYPE,
                              INFER_CHANNEL_UNITS, INFER_SECONDS, dac_error, parse_error_log, stop_event))
    thread.start()


def parse_tdms_thread (database, model, tdms_ref, MIN_TIME_STEPS, MIN_CHANNELS, SHOT_TYPE, TIME_STEP_TYPE,
                              INFER_CHANNEL_UNITS, INFER_SECONDS, dac_error, parse_error_log, stop_event):
    """
    Extracts CSV/META data from the zipfile uploaded to the server
    and processes it/combines it into data in the DAC generic format,
    finally pushing that data to the server.  Problems are described
    and returned to the calling function.
    """

    # put entire thread into a try-except block in order to print
    # errors to cherrypy.log.error
    try:

        # import dac_upload_model from source
        push = imp.load_source('dac_upload_model',
                               os.path.join(os.path.dirname(__file__), 'py/dac_upload_model.py'))

        dac_error.log_dac_msg("TDMS thread started.")

        # filter shots according to user preferences MIN_TIME_STEPS and MIN_CHANNELS
        parse_error_log, shot_meta, shot_data = filter_shots(database, model, dac_error,
            parse_error_log, tdms_ref, MIN_TIME_STEPS, MIN_CHANNELS, 10.0, 40.0)

        # was any data imported?
        if len(shot_meta) == 0:

            dac_error.quit_raise_exception(database, model, parse_error_log,
                "No data imported -- check minimum channel (" +
                str(MIN_CHANNELS) + ") and minimum time step (" +
                str(MIN_TIME_STEPS) + ") filters.")

        # finalize list of usable channels
        parse_error_log, channel_names, shot_data = filter_channels(database, model,
            dac_error, parse_error_log, shot_meta[0].index[0], shot_data, SHOT_TYPE)

        # check that enough channels are still present
        if len(channel_names) < MIN_CHANNELS:

            dac_error.quit_raise_exception(database, model, parse_error_log,
                "No data imported -- available numbers of channels is less than " + str(MIN_CHANNELS) + ".")

        # push progress for wizard polling to database
        slycat.web.server.put_model_parameter(database, model, "dac-polling-progress",
                                              ["Extracting ...", 45.0])

        # get shot units
        shot_units = [[channel['unit'] for channel in shot] for shot in shot_data]

        # finalize channel units
        parse_error_log, channel_units = infer_channel_units(database, model, dac_error,
            parse_error_log, shot_meta[0].index[0], channel_names, shot_units, INFER_CHANNEL_UNITS, SHOT_TYPE)

        # normalize time step data
        parse_error_log, time_steps, shot_data, channel_names, channel_units = \
            normalize_time_steps(database, model, dac_error, parse_error_log,
                shot_data, channel_names, channel_units, MIN_TIME_STEPS, TIME_STEP_TYPE, 45.0, 55.0)

        # check that enough channels are still present
        if len(channel_names) < MIN_CHANNELS:

            dac_error.quit_raise_exception(database, model, parse_error_log,
                "No data imported -- available numbers of channels is less than " + str(MIN_CHANNELS) + ".")

        # construct DAC variables and distance matrices to match time steps
        parse_error_log, variables, var_dist = construct_variables(database, model,
            dac_error, parse_error_log, shot_data, time_steps, 55.0, 65.0)

        # get shot time units
        shot_time_units = [[channel['wf_unit'] for channel in shot] for shot in shot_data]

        # finalize time units
        parse_error_log, channel_time_units, time_steps = \
            infer_channel_time_units(database, model, dac_error, parse_error_log,
                                     shot_meta[0].index[0], shot_time_units,
                                     time_steps, INFER_SECONDS, channel_names)

        # construct remaining DAC variables

        # construct meta data table (modified from Jeremy Little's code to
        # append [root] to root columns and [group] to group columns)
        meta_df = pd.DataFrame()
        for i in range(0, len(shot_meta)):

            # add rows and repeat
            meta_df = meta_df.append(shot_meta[i], sort=False)

        # convert pandas dataframe to header and rows
        meta_column_names = meta_df.reset_index().columns.values.tolist()
        meta_rows = meta_df.reset_index().values.tolist()

        # construct variables.meta table
        meta_var_col_names = ['Name', 'Time Units', 'Units', 'Plot Type']

        # construct meta variable rows
        meta_vars = []
        num_vars = len(channel_names)
        for i in range(0, num_vars):
            meta_vars.append([channel_names[i], channel_time_units[i], channel_units[i], 'Curve'])

        # show which digitizers were parsed
        for i in range(num_vars):
            parse_error_log.append("Channel " + str(meta_vars[i][0]) + " parsed successfully.")

        # check that we still have enough digitizers
        if num_vars < MIN_CHANNELS:
            parse_error_log = dac_error.update_parse_log(database, model, parse_error_log, "Progress",
                                   "Total number of channels parsed less than " + str(MIN_CHANNELS) +
                                   " -- no data remaining.")
            meta_rows = []

        # if no parse errors then inform user
        if len(parse_error_log) == 1:
            parse_error_log = dac_error.update_parse_log(database, model, parse_error_log, "Progress",
                                               "No parse errors.")

        # summarize results for user
        parse_error_log.insert(0, "Summary:")
        parse_error_log.insert(1, "Total number of tests parsed: " + str(len(meta_rows)) + ".")
        parse_error_log.insert(2, "Each test has " + str(num_vars) + " digitizer time series.\n")

        # push progress for wizard polling to database
        slycat.web.server.put_model_parameter(database, model, "dac-polling-progress",
                                              ["Uploading ...", 70.0])

        # if no data then return failed result
        if len(meta_rows) == 0:

            dac_error.quit_raise_exception(database, model, parse_error_log,
                                           "All data discarded.")

        else:

            # upload model to slycat database
            push.init_upload_model (database, model, dac_error, parse_error_log,
                                    meta_column_names, meta_rows,
                                    meta_var_col_names, meta_vars,
                                    variables, time_steps, var_dist)

            # done -- destroy the thread
            stop_event.set()

    except Exception as e:

        dac_error.report_load_exception(database, model, parse_error_log, traceback.format_exc())

        stop_event.set()


def parse_tdms_zip(database, model, input, files, aids, **kwargs):

    """
    uploads a set of .tdms .zip file and parses it for the database
    :param database: slycat.web.server.database.couchdb.connect()
    :param model: database.get("model", self._mid)
    :param input: boolean
    :param files: files to be parsed
    :param aids: artiftact id
    :param kwargs:
    """

    # import error handling from source
    dac_error = imp.load_source('dac_error_handling',
                           os.path.join(os.path.dirname(__file__), 'py/dac_error_handling.py'))

    dac_error.log_dac_msg("TDMS zip parser started.")

    # get user parameters
    MIN_TIME_STEPS = int(aids[0])
    MIN_CHANNELS = int(aids[1])
    SHOT_TYPE = aids[2]
    TIME_STEP_TYPE = aids[3]
    INFER_CHANNEL_UNITS = aids[4]
    INFER_SECONDS = aids[5]
    SUFFIX_LIST = aids[6]

    # keep a parsing error log to help user correct input data
    # (each array entry is a string)
    parse_error_log = dac_error.update_parse_log(database, model, [], "Progress", "Notes:")

    # push progress for wizard polling to database
    slycat.web.server.put_model_parameter(database, model, "dac-polling-progress", ["Extracting ...", 10.0])

    # treat uploaded file as bitstream
    try:

        file_like_object = io.BytesIO(files[0])
        zip_ref = zipfile.ZipFile(file_like_object)
        zip_files = zip_ref.namelist()

    except Exception as e:

        dac_error.quit_raise_exception(database, model, parse_error_log,
                             "Couldn't read .zip file (too large or corrupted).")

    # loop through zip files and look for tdms files matching suffix list
    file_list = []
    file_object = []
    tdms_ref = []

    for zip_file in zip_files:

        # get file name and extension
        head, tail = os.path.split(zip_file)
        ext = tail.split(".")[-1].lower()

        # is it a tdms file?
        if ext == 'tdms' or ext =='tdm':

            # get suffix
            suffix = tail.split("_")[-1].split(".")[0]

            # should we read this file?
            if suffix in SUFFIX_LIST:

                try:

                    file_object.append(io.BytesIO(zip_ref.read(zip_file)))
                    tdms_ref.append(nptdms.TdmsFile(file_object[-1]))

                    file_list.append(zip_file)

                except Exception as e:

                    dac_error.quit_raise_exception(database, model, parse_error_log,
                                                   "Couldn't read .tdms file.")

    # log files to be parsed
    for file_to_parse in file_list:
        parse_error_log = dac_error.update_parse_log(database, model, parse_error_log, "Progress",
                                           'Found file to parse: "' + file_to_parse + '".')

    # launch thread to read actual tdms files
    stop_event = threading.Event()
    thread = threading.Thread(target=parse_tdms_thread, args=(database, model, tdms_ref,
        MIN_TIME_STEPS, MIN_CHANNELS, SHOT_TYPE, TIME_STEP_TYPE,
        INFER_CHANNEL_UNITS, INFER_SECONDS, dac_error, parse_error_log, stop_event))
    thread.start()


def register_slycat_plugin(context):
    context.register_parser("dac-tdms-file-parser", ".tdms or .TDM file(s)", ["dac-tdms-files"], parse_tdms)
    context.register_parser("dac-tdms-zip-file-parser", "TDMS .zip file", ["dac-tdms-files"], parse_tdms_zip)