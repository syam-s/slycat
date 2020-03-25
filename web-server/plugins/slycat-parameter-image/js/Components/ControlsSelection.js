import * as dialog from "js/slycat-dialog";
import React from "react";
import _ from "lodash";

const ControlsSelection = (props) => {

  const set_value = (variable, variableIndex, value, alert) => {
    dialog.prompt({
      title: "Set Values",
      message: "Set values for " + variable + ":",
      value: '',
      alert: alert,
      buttons: [
        {className: "btn-light", label:"Cancel"},
        {className: "btn-primary", label:"Apply"}
      ],
      callback: function(button, valueIn)
      {
        if(button.label === "Apply")
        {
          let userValue = valueIn().trim();
          let numeric = props.metadata["column-types"][variableIndex] !== "string";
          let valueValid = userValue.length > 0;
          if( valueValid && numeric && isNaN(Number(userValue)) ) {
            valueValid = false;
          }
          if(valueValid) {
            props.element.trigger("set-value", {
              selection : props.selection,
              variable : variableIndex,
              value : numeric ? userValue : '"' + userValue + '"',
            });
          } else {
            let alertText = "Please enter a value.";
            if(numeric)
            {
              alertText = "Please enter a numeric value.";
            }
            set_value(variable, variableIndex, userValue, alertText);
          }
        }
      },
    });
  };

  let rating_variable_controls = props.rating_variables.map((rating_variable) => (
    <React.Fragment key={rating_variable}>
      <h6 className='dropdown-header'>{props.metadata['column-names'][rating_variable]}</h6>
      <a href='#' className='dropdown-item'
         onClick={(e) => set_value(props.metadata['column-names'][rating_variable], rating_variable, e)}>
        Set
      </a>
    </React.Fragment>
  ));

  const all_selected_hidden = _.difference(props.selection, props.hidden_simulations).length === 0;
  const all_selected_visible = _.intersection(props.selection, props.hidden_simulations).length === 0;

  const no_hidden_unselected = _.difference(props.hidden_simulations, props.selection).length === 0;
  const unselected = _.difference(props.indices, props.selection);
  const no_visible_unselected = _.difference(unselected, props.hidden_simulations).length === 0;

  return (
    <div className='btn-group'>
      <button 
        className={`btn btn-sm dropdown-toggle ${props.button_style} ${props.selection.length > 0 ? '' : 'disabled'}`}
        type='button' id='selection-dropdown' data-toggle='dropdown' 
        aria-expanded='false' aria-haspopup='true' title='Perform Action On Selection'>
        Selection Action
      </button>
      <div id='selection-switcher' className='dropdown-menu' aria-labelledby='selection-dropdown'>
        {rating_variable_controls}
        <h6 className='dropdown-header'>Selected Items</h6>
        <a href='#' 
          className={`dropdown-item ${props.disable_hide_show || all_selected_hidden ? 'disabled' : ''}`}
          onClick={props.trigger_hide_selection}>
          Hide
        </a>
        <a href='#' 
          className={`dropdown-item ${props.disable_hide_show || all_selected_visible ? 'disabled' : ''}`}
          onClick={props.trigger_show_selection}>
          Show
        </a>
        {!props.hide_pin &&
          <a href='#' 
            className={`dropdown-item ${props.disable_pin ? 'disabled' : ''}`}
            onClick={props.trigger_pin_selection}>
            Pin
          </a>
        }
        <h6 className='dropdown-header'>Unselected Items</h6>
        <a href='#' 
          className={`dropdown-item ${props.disable_hide_show || no_visible_unselected ? 'disabled' : ''}`}
          onClick={props.trigger_hide_unselected}>
          Hide Unselected
        </a>
        <a href='#' 
          className={`dropdown-item ${props.disable_hide_show || no_hidden_unselected ? 'disabled' : ''}`}
          onClick={props.trigger_show_unselected}>
          Show Unselected
        </a>
      </div>
    </div>
  );
};

export default ControlsSelection