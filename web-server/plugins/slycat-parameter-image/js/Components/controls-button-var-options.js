import React, { useState } from "react";
import ControlsButton from 'components/ControlsButton';
import SlycatTableIngestion from "js/slycat-table-ingestion-react";
import VariableAliasLabels from "components/VariableAliasLabels";
import "js/slycat-table-ingestion";
import ko from "knockout";
import "../../css/controls-button-var-options.css";
import $ from "jquery";

export default function ControlsButtonVarOptions(props) {
  const modalId = 'varOptionsModal';
  const title = 'Display Settings';

  function aliasesValid() {
    let aliasForm = document.getElementById('variable-alias-tab-content');
    if(aliasForm)
    {
      let inputs = aliasForm.querySelectorAll('input');
      for (const input of inputs) {
        if(input.checkValidity() === false)
        {
          return false;
        }
      }
    }
    return true;
  }

  function closeModal(e) {
    $('#' + modalId).modal('hide');
  }

  let axes_variables = [];
  for(let [index, axes_variable] of props.axes_variables.entries())
  {
    let scale_type = 'Linear';
    if(props.axes_variables_scale[index] !== undefined)
    {
      scale_type = props.axes_variables_scale[index];
    }
    axes_variables.push({
      "Axis Type": scale_type,
      // 'Alex Testing Bool True': true,
      // 'Alex Testing Bool False': false,
      "disabled": false,
      "hidden": false,
      "lastSelected": false,
      "name": axes_variable.name,
      "selected": false,
      "tooltip": '',
    });
  }
  // Testing various properties
  // axes_variables[1].disabled = true;
  // axes_variables[1].tooltip = 'Alex Testing Tooltip';
  // axes_variables[1].selected = true;

  let axes_properties = [{name: 'Axis Type', 
                          type: 'select', 
                          values: ['Linear','Date & Time','Log']
                        }];
  // // Testing boolean property
  // axes_properties.push({
  //   name: 'Alex Testing Bool True',
  //   type: 'bool',
  // });
  // // Testing boolean property
  // axes_properties.push({
  //   name: 'Alex Testing Bool False',
  //   type: 'bool',
  // });

  const fonts = [
    {name: "Arial", fontFamily: "Arial", },
    {name: "Arial Black", fontFamily: "Arial Black", },
    {name: "Courier", fontFamily: "Courier", },
    {name: "Courier New", fontFamily: "Courier New", },
    {name: "Georgia", fontFamily: "Georgia", },
    {name: "Tahoma", fontFamily: "Tahoma", },
    {name: "Times", fontFamily: "Times", },
    {name: "Times New Roman", fontFamily: "Times New Roman", },
    {name: "Trebuchet MS", fontFamily: "Trebuchet MS", },
    {name: "Verdana", fontFamily: "Verdana", },
  ];

  const fontItems = fonts.map((font, index) => (
    <a key={index} 
      href='#' onClick={props.onFontFamilyChange}
      style={{fontFamily: font.fontFamily}} 
      className={`dropdown-item {font.fontFamily == props.font_family ? 'active' : 'notactive'}`}
    >
      {font.name}
    </a>
  ));

  return (
    <React.Fragment>
      <div className='modal fade' data-backdrop='false' id={modalId}>
        <div className='modal-dialog modal-lg'>
          <div className='modal-content'>
            <div className='modal-header'>
              <h3 className='modal-title'>{title}</h3>
              <button type='button' className='close' data-dismiss='modal' aria-label='Close' disabled={!aliasesValid()}>
                <span aria-hidden='true'>&times;</span>
              </button>
            </div>
            <div className='modal-body'>

              <ul className='nav nav-tabs' role='tablist'>
                <li className='nav-item'>
                  <a className='nav-link active' id='axes-scales-tab' data-toggle='tab' 
                    href='#axes-scales-tab-content' role='tab' aria-controls='axes-scales-tab-content' aria-selected='true'>
                    <h5 className='mb-0'>Axes Scales</h5>
                  </a>
                </li>
                <li className='nav-item'>
                  <a className='nav-link' id='variable-alias-tab' data-toggle='tab' 
                    href='#variable-alias-tab-content' role='tab' aria-controls='variable-alias-tab-content' aria-selected='false'>
                    <h5 className='mb-0'>Variable Alias Labels</h5>
                  </a>
                </li>
              </ul>

              <div className='tab-content mt-4 mb-2 mx-3'>
                <div className='tab-pane active' id='axes-scales-tab-content' role='tabpanel' aria-labelledby='axes-scales-tab'>
                  <div className='slycat-axes-font'>
                    <div className='form-inline'>
                      <div className='form-group'>
                        <label htmlFor='font-family'>Font</label>
                        <div className='dropdown font-family-dropdown'>
                          <button className='btn btn-sm btn-outline-dark dropdown-toggle' type='button' id='font-family' 
                            data-toggle='dropdown' aria-haspopup='true' aria-expanded='false' style={{fontFamily: props.font_family}}>
                            {props.font_family}
                          </button>
                          <div className='dropdown-menu' aria-labelledby='dropdownMenu1'>
                            {fontItems}
                          </div>
                        </div>
                      </div>
                      <div className='form-group'>
                        <label htmlFor='font-size'>Size</label>
                        <input type='number' className='form-control form-control-sm' id='font-size' max='40' min='8' step='1' style={{width: "70px"}}
                          value={props.font_size} 
                          onChange={() => props.changeFontSize(event.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <hr />
                  <SlycatTableIngestion 
                    uniqueID='varOptions'
                    variables={axes_variables}
                    properties={axes_properties}
                    onChange={props.onAxesVariableScaleChange}
                  />
                </div>
                <div className='tab-pane' id='variable-alias-tab-content' role='tabpanel' aria-labelledby='variable-alias-tab'>
                  <VariableAliasLabels 
                    variableAliases={props.variable_aliases}
                    metadata={props.metadata}
                    onChange={props.onVariableAliasLabelsChange}
                  />
                </div>
              </div>

            </div>
            <div className='modal-footer'>
              <button type='button' className='btn btn-primary' onClick={closeModal}
                disabled={!aliasesValid()}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
      <ControlsButton 
        icon='fa-cog' title={title} data_toggle='modal' data_target={'#' + modalId} 
        button_style={props.button_style} id='controls-button-var-options' 
      />
    </React.Fragment>
  );
}
