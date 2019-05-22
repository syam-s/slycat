/*
Copyright 2013 National Technology & Engineering Solutions of Sandia, LLC (NTESS). 
Under the terms of Contract DE-NA0003525 with NTESS, the U.S. Government 
retains certain rights in this software.
*/
// This wizard creates an empty movie-plex model, modified from the
// CCA wizard.
//
// S. Martin
// 3/31/2017


import api_root from "js/slycat-api-root";
import client from "js/slycat-web-client";
import * as dialog from "js/slycat-dialog";
import markings from "js/slycat-markings";
import ko from "knockout";
import mapping from "knockout-mapping";
import fileUploader from "js/slycat-file-uploader-factory";
import URI from "urijs";
import vsWizardUI from "../html/vs-wizard.html";

function constructor(params)
{

// functions accessible outside this define are returned via component
var component = {};

component.tab = ko.observable(0);
component.project = params.projects()[0];
// Alex removing default model name per team meeting discussion
// component.model = mapping.fromJS({_id: null, name: "New VideoSwarm Model",
//                         description: "", marking: markings.preselected()});
component.model = mapping.fromJS({_id: null, name: "",
                        description: "", marking: markings.preselected()});

// csv table browser
component.table_browser = mapping.fromJS({
    path:null,
    selection: [],
    progress: ko.observable(null),
});

// vs file browser
component.vs_browser = mapping.fromJS({
    path:null,
    selection: [],
    progress: ko.observable(null),
});

// prevent user from uploading files twice
var vs_files_uploaded = false;
var remote_table_uploaded = false;

// data for media columns link selector
component.vs_media_columns = ko.observableArray([]);
var media_columns_inds = [];
var vs_table_num_rows = null;

// working directory
localStorage["VS_WORKDIR"] ? component.workdir = ko.observable(localStorage["VS_WORKDIR"]) : component.workdir = ko.observable('');
component.delete_workdir = ko.observable(false);

// video frame rate (defaults to 25)
component.frame_rate = ko.observable(25);

// HPC job information
component.wckey = ko.observable('');
component.partition = ko.observable('');
component.nnodes = ko.observable('1');
component.ntasks_per_node = ko.observable('1');
component.time_hours = ko.observable('01');
component.time_minutes = ko.observable('00');

// HPC UI status
component.HPC_Job = ko.observable(false);

// if we need to launch a remote job, we need column for the frames
// note these are 0-based, but the script is 1-based
var launch_remote_job = false;
var frame_column = null;
var link_column = null;

// access to remote clusters
component.remote = mapping.fromJS({
  hostname: null,
  username: null,
  password: null,
  status: null,
  status_type: null,
  enable: true,
  focus: false,
  sid: null,
  session_exists: false,
  progress: ko.observable(null),
});

// file parser (table is csv table, vs is videoswarm specific files)
component.table_parser = ko.observable(null);
component.vs_parser = ko.observable(null);
component.attributes = mapping.fromJS([]);

// select local (windows share) or remote (cluster), defaults to local
component.vs_type = ko.observable("local");

// make dialog bigger for remote/share selections
component.vs_type.subscribe(function(newValue) {
  if(newValue === 'local')
  {
    $(".modal-dialog").removeClass("modal-lg");
  }
  else
  {
    $(".modal-dialog").addClass("modal-lg");
  }
});

// creates an empty model of type "MP"
component.create_model = function() {
    client.post_project_models({
    pid: component.project._id(),
    type: "VS",
    name: component.model.name(),
    description: component.model.description(),
    marking: component.model.marking(),
    success: function(mid) {
        component.model._id(mid);
        //component.tab(1);
    },
        error: dialog.ajax_error("Error creating model.")
    });
};

// create a model as soon as the dialog loads
// we rename, change description, and marking later.
component.create_model();

// if the user selects the cancel button we delete the model just created
component.cancel = function() {
    if(component.model._id())
        client.delete_model({ mid: component.model._id() });
};

// first tab is used to select upload type
component.select_type = function() {
  var type = component.vs_type();

  if (type === "local") {
    component.tab(1);
  } else if (type === "remote") {
    component.tab(3);
  }
};

// code for local upload
component.upload_local_table = function() {

  if (!vs_files_uploaded) {

      // check that csv file has been selected
      if (component.table_browser.selection().length > 0) {

          // get table file name extension
          var csv_file = component.table_browser.selection()[0];
          var csv_file_name = csv_file["name"];
          var csv_file_ext = csv_file_name.split(".").pop();

          // check that table file is .csv
          if (csv_file_ext.toLowerCase() == "csv") {

              // next check VS file names

              //  expected VS artifacts and order
              var aids = ["movies.xcoords", "movies.ycoords", "movies.trajectories"];
              var aids_ext = ["xcoords", "ycoords", "trajectories"];

              // check for correct files and re-arrange to match artifact order
              var num_files = component.vs_browser.selection().length;
              var num_files_found = 0;
              var vs_files = [];
              if (num_files === 3) {
                  for (var i=0; i < 3; i++) {
                      for (var j=0; j < 3; j++) {

                          // look for correct extension
                          var file = component.vs_browser.selection()[j];
                          var file_ext = file["name"].split(".").pop();

                          // put in expected order
                          if (aids_ext[i] === file_ext) {
                              vs_files.push (file);
                              num_files_found = num_files_found + 1;
                          }
                      }
                  }
              }

              // did the user select the VS format files?
              if (num_files === 3 && num_files_found === 3) {

                // make button show swirling wait indicator
                $('.local-browser-continue').toggleClass("disabled", true);

                // upload csv file
                upload_csv_file(csv_file, aids, vs_files);

              } else {

                 // alert user that they had an incorrect file selection
                 dialog.ajax_error(
                    "Please select three files with extensions .xcoords, .ycoords, and .trajectories.")
                    ("","","");
              }

          } else {

            // user did not select .csv extension file for table
            dialog.ajax_error("The CSV file selected does not have the .csv extension.")("","","");
          }
      } else {

          // no file selected
          dialog.ajax_error("Please select a CSV file.")("","","");
      }

  } else {

      // go to select file links
      component.tab(2);
  }
};

var upload_csv_file = function (csv_file, aids, vs_files) {

    // upload csv file
    console.log("Uploading CSV file ...");

    // first upload csv table
    var fileObject ={
        pid: component.project._id(),
        mid: component.model._id(),
        file: csv_file,
        aids: [["movies.meta"], ["test"]],
        parser: component.table_parser(),
        progress: component.table_browser.progress,
        progress_status: component.table_browser.progress_status,
        progress_final: 100,
        success: function(){

            // next load movies.links
            upload_mp_matrices(aids, vs_files, 0);

        },
        error: function(){
          dialog.ajax_error("There was a problem parsing the .csv file.")("","","");
          $('.local-browser-continue').toggleClass("disabled", false);
          component.table_browser.progress(null);
          component.table_browser.progress_status('');
        }
    };
    fileUploader.uploadFile(fileObject);
}

// Alex's code to keep track of meta-data (now modified to control UI as well)
var upload_media_columns = function (go_to_tab) {

    // Find the media columns, those with links to videos
    client.get_model_command({
        mid: component.model._id(),
        type: "VS",
        command: "media-columns",
        success: function(media_columns) {

            media_columns_inds = media_columns;

            // Save the media columns as a new artifact
            client.put_model_parameter({
                mid: component.model._id(),
                aid: [["media_columns"]],
                value: media_columns,
                input: true,
                success: function() {
                  console.log("Saved media_columns.");
                }
            });

            client.get_model_table_metadata({
                mid: component.model._id(),
                aid: "movies.meta",
                success: function(metadata) {
                  var attributes = [];
                  for(var i = 0; i !== metadata["column-names"].length; ++i) {
                    attributes.push({
                      name:metadata["column-names"][i],
                      type:metadata["column-types"][i],
                      input:false,
                      output:false,
                      category:false,
                      rating:false,
                      image:media_columns.indexOf(i) !== -1,
                      Classification: 'Neither',
                      Categorical: false,
                      Editable: false,
                      hidden: media_columns.indexOf(i) !== -1,
                      selected: false,
                      lastSelected: false,
                      disabled: false,
                      tooltip: ""
                    });

                    // if it's a media column, add it to the links selector
                    if (media_columns_inds.indexOf(i) !== -1) {
                        component.vs_media_columns.push(metadata["column-names"][i]);
                    }
                  }

                  // save number of rows
                  vs_table_num_rows = metadata["row-count"];

                  mapping.fromJS(attributes, component.attributes);

                  // turn on continue button (both local and remote)
                  $(".browser-continue").toggleClass("disabled", false);

                  // check to see if we found any media columns before continuing
                  if (media_columns_inds.length === 0) {

                    dialog.ajax_error("Could not detect any media links in the CSV file.  Please choose a different CSV file.")("","","");

                    // reset loading options for remote upload
                    if (component.tab() === 4) {

                        component.remote.progress(null);
                        remote_table_uploaded = false;

                    };

                    // reset loading options for local upload
                    if (component.tab() === 1) {

                        component.table_browser.progress(null);
                        component.vs_browser.progress(null);
                        vs_files_uploaded = false;

                    }

                  } else {

                    // disable other loading options after everything has beens successfully loaded
                    if (component.tab() === 4) {

                        // disable local
                        $("#local-radio").attr("disabled", true);
                        $("#local-radio").parent().toggleClass("disabled", true);

                    }

                    if (component.tab() === 1) {

                        // disable remote
                        $("#remote-radio").attr("disabled", true);
                        $("#remote-radio").parent().toggleClass("disabled", true);

                    }

                    component.tab(go_to_tab);
                  }

                }
              });
        }
    });
};

// code to connect to remove server
component.connect = function() {

  component.remote.enable(false);
  component.remote.status_type("info");
  component.remote.status("Connecting ...");

  if(component.remote.session_exists())
  {
    component.tab(4);
    component.remote.enable(true);
    component.remote.status_type(null);
    component.remote.status(null);
  }
  else
  {
    client.post_remotes({
      hostname: component.remote.hostname(),
      username: component.remote.username(),
      password: component.remote.password(),
      success: function(sid) {
        component.remote.session_exists(true);
        component.remote.sid(sid);
        component.tab(4);
        component.remote.enable(true);
        component.remote.status_type(null);
        component.remote.status(null);
      },
      error: function(request, status, reason_phrase) {
        component.remote.enable(true);
        component.remote.status_type("danger");
        component.remote.status(reason_phrase);
        component.remote.focus("password");
      }
    });
  }
};

// upload remote table
component.upload_remote_table = function() {

  // check if table has already been uploaded
  if (!remote_table_uploaded) {

      // disable continue button
      $('.remote-browser-continue').toggleClass("disabled", true);

      // load csv file
      var fileObject ={
       pid: component.project._id(),
       hostname: [component.remote.hostname()],
       mid: component.model._id(),
       paths: [component.table_browser.selection()],
       aids: ["movies.meta"],
       parser: component.table_parser(),
       progress: component.remote.progress,
       progress_final: 100,
       success: function(){

         // note that table has been uploaded
         remote_table_uploaded = true;

         // update movie links part of model, go to tab 5
         upload_media_columns(5);

       },
       error: function(){
          dialog.ajax_error("Did you choose the correct file and filetype?  There was a problem parsing the file: ")();
          $('.remote-browser-continue').toggleClass("disabled", false);
          component.remote.progress(null);
        }
      };
      fileUploader.uploadFile(fileObject);

  } else {

    component.tab(5);

  }
};

// run remote job to process movie files
var start_remote_job = function () {

    // set up remote launch (note movie and frame column are 1-based)
    var payload = {"command":
        {"scripts":[{"name":"parse_frames","parameters":[
        {"name":"--csv_file","value": component.table_browser.selection()[0]},
        {"name":"--frame_col","value": frame_column + 1},
        {"name":"--movie_col","value": link_column + 1},
        {"name":"--output_dir","value": component.workdir()},
        {"name":"--fps","value": component.frame_rate()}]}],
        "hpc":{"is_hpc_job": component.HPC_Job(),
            "parameters":{"wckey": component.wckey(),
                           "partition": component.partition(),
                           "nnodes": component.nnodes(),
                           "ntasks_per_node": component.ntasks_per_node(),
                           "time_hours": component.time_hours(),
                           "time_minutes": component.time_minutes(),
                           "time_seconds": '0',
                           "working_dir": component.workdir()}}}};

        // launch job
        $.ajax({
            contentType: "application/json",
            type: "POST",
            url: URI(api_root + "remotes/" +
                     component.remote.hostname() + "/post-remote-command"),
            success: function(result)
            {

                // put job ID into loading progress variable
                client.put_model_parameter({
                    mid: component.model._id(),
                    aid: "vs-loading-parms",
                    value: ["Remote", result["log_file_path"],
                            component.remote.hostname(),
                            component.workdir()],
                    success: function () {

                        console.log("Launched remote job, ID = " + result["jid"] + ".");

                        // go to model
                        component.go_to_model();

                    },
                    error: function () {
                        dialog.ajax_error("Error uploading remote job data.")("","","");
                        $('.vs-finish-button').toggleClass("disabled", false);
                    }
                });
            },
            error: function()
            {
                dialog.ajax_error("Error launching remote job.")("","","");
                $('.vs-finish-button').toggleClass("disabled", false);

            },
            data: JSON.stringify(payload)
        });
};

// upload movie plex links (from csv table)
component.upload_vs_links = function () {

    console.log ("Uploading video links ...");

    // get column in table of selected link
    var link_selected = $("#vs-local-links-selector").val();
    var link_selected_ind = component.vs_media_columns.indexOf(link_selected);
    var link_column = media_columns_inds[link_selected_ind];

    // extract links column into it's own variable
    client.get_model_command({
        mid: component.model._id(),
        type: "VS",
        command: "extract-links",
        parameters: [link_column],
        success: function(result) {
            component.tab(7)
        },
        error: function() {

            // server error extracting video links
            dialog.ajax_error("Server error during video link extraction.")("","","");
            $(".local-browser-continue").toggleClass("disabled", false);
        }
    });
};

// upload movie links (from remote file)
component.upload_vs_frames_links = function () {

    // check to see if user provided working directory
    if (component.workdir().trim() === '') {

        dialog.ajax_error("Please enter a working directory.")("","","");

    // check to see if fps is greater than 0
    } else if (component.frame_rate() <= 0) {

        dialog.ajax_error("Please enter a frame rate greater than 0.")("","","");

    // otherwise everything is OK
    } else {
        localStorage["VS_WORKDIR"] = component.workdir();
        console.log ("Uploading video links ...");

        // get column for frames
        var frame_selected = $("#vs-remote-frames-selector").val();
        var frame_selected_ind = component.vs_media_columns.indexOf(frame_selected);
        frame_column = media_columns_inds[frame_selected_ind];

        // get column in table of selected link for videos
        var link_selected = $("#vs-remote-videos-selector").val();
        var link_selected_ind = component.vs_media_columns.indexOf(link_selected);
        link_column = media_columns_inds[link_selected_ind];

        // extract links on server
        client.get_model_command({
            mid: component.model._id(),
            type: "VS",
            command: "extract-links",
            parameters: [link_column],
            success: function(result) {

                // name model and launch remote job
                launch_remote_job = true;
                component.tab(6)
            },
            error: function() {

                // server error extracting video links
                dialog.ajax_error("Server error during video link extraction.")("","","");
                $(".remote-browser-continue").toggleClass("disabled", false);
            }
        });

    }

};

// upload remaining matrix files
var upload_mp_matrices = function (aids, files, file_num) {

    // upload requested matrix file then call again with next file
    var file = files[file_num];
    console.log("Uploading file: " + file.name);

    var fileObject ={
        pid: component.project._id(),
        mid: component.model._id(),
        file: file,
        aids: [[aids[file_num], "matrix"],["matrix"]],
        parser: component.vs_parser(),
        progress: component.vs_browser.progress,
        progress_increment: 100/3,
        success: function(){
                if (file_num < 2) {
                    upload_mp_matrices(aids, files, file_num + 1);
                } else {

                    // finished uploading -- go to next tab in UI
                    vs_files_uploaded = true;

                    // find the media columns, then go to tab 2
                    upload_media_columns(2);
                }
            },
        error: function(){
            dialog.ajax_error(
                "There was a problem parsing the " + aids[file_num] + " file.")
                ("","","");
                $('.local-browser-continue').toggleClass("disabled", false);
            }
        };
    fileUploader.uploadFile(fileObject);
};

// very last function called to launch model
component.go_to_model = function() {
  location = '/models/' + component.model._id();
};

component.check_hpc_job = function () {

    // does the user want a HPC
    if (component.HPC_Job() === true) {

        if (component.wckey() === '') {

            dialog.ajax_error("Please enter an account ID.")("","","");

        } else if (component.partition() === '') {

            dialog.ajax_error("Please enter a partition/queue.")("","","");

        } else {

            // got everything needed, next name model
            component.tab(7);
        }

    } else {

        // not an HPC job -- go name model
        component.tab(7);

    }

};

// called after the last tab is finished to name the model
component.name_model = function() {

    // turn off finish button
    $('.vs-finish-button').toggleClass("disabled", true);

    client.put_model(
    {
    mid: component.model._id(),
    name: component.model.name(),
    description: component.model.description(),
    marking: component.model.marking(),
    success: function()
    {
        client.post_model_finish({
        mid: component.model._id(),
        success: function() {

                // do we need to launch a remote job?
                if (launch_remote_job) {

                    start_remote_job();

                } else {

                    // mark as already uploaded and go to model
                    client.put_model_parameter({
                        mid: component.model._id(),
                        aid: "vs-loading-parms",
                        value: ["Uploaded"],
                        success: function () {

                            // go to model
                            component.go_to_model();

                        },
                        error: function () {
                            dialog.ajax_error("Error uploading model status.")("","","");
                            $('.vs-finish-button').toggleClass("disabled", false);
                        }
                    });
                }
            }
        });
    },
    error: dialog.ajax_error("Error updating model."),
    });
};

// operate the back button
component.back = function() {
  var target = component.tab();

  // Skip Upload Table tab if we're on the Choose Host tab.
  if(component.tab() === 3)
  {
    target = target - 2;
  }

  // Skip remote ui tabs if we are local
  if(component.vs_type() === 'local' && component.tab() === 7)
  {
    target = target - 4;
  }

  target--;
  component.tab(target);
};

return component;
}

export default {
viewModel: constructor,
template: vsWizardUI,
};