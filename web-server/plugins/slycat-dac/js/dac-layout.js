// This function sets up the jquery layout for the dial-a-cluster function.
// It uses the variables SLYCAT_HEADER, ALPHA_SLIDER_WIDTH,
// and ALPHA_BUTTONS_HEIGHT as passed from dac-ui.js.

// S. Martin
// 1/15/2015

import scatter_plot from "./dac-scatter-plot.js";
import plots from "./dac-plots.js";
import metadata_table from "./dac-table.js";

export default {

    setup: function(ALPHA_SLIDER_WIDTH, ALPHA_BUTTONS_HEIGHT,
        SCATTER_BUTTONS_HEIGHT)
    {

        // set up control bar above scatter plot

        // Set up the outer layout (includes center and east)
        $("#dac-model").layout(
        {
            applyDefaultStyles: true,
            east:
            {
                size: $(window).width() / 3,
            },
            onresize_end: function()
            {
                plots.draw();
            }
        });

        // setup inner window layout.
        $("#dac-model > .ui-layout-center").layout(
        {
            applyDefaultStyles: true,
            south:
            {
                size: $(window).height() / 4,
            },
            onresize_end: function ()
            {
                metadata_table.resize();
            },
            west:
            {
                size: ALPHA_SLIDER_WIDTH,
            },
        });

        // set up inner window with scatter plot & buttons
        $("#dac-model > .ui-layout-center > .ui-layout-center").layout(
        {
            applyDefaultStyles: true,
            north:
            {
                size: SCATTER_BUTTONS_HEIGHT,
            },
            onresize_end: function()
            {
                scatter_plot.draw();
            },
        });

        // set up the west window layout (with alpha buttons)
        $("#dac-model > .ui-layout-center > .ui-layout-west").layout(
        {
            applyDefaultStyles: true,
            south:
            {
                size: ALPHA_BUTTONS_HEIGHT,
            },
        });

        // when resizing the window, adjust the height of the layout.
        $(window).resize(function()
        {
            $("#dac-model").height($(window).height());
        });

    }
};
