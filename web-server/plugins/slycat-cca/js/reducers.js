import _ from 'lodash';
import {
  SET_VARIABLE_SELECTED,
  SET_VARIABLE_SORTED,
  SET_CCA_COMPONENT_SELECTED,
  SET_CCA_COMPONENT_SORTED,
  SET_SIMULATIONS_SELECTED,
  ADD_SIMULATIONS_SELECTED,
  REMOVE_SIMULATIONS_SELECTED,
  TOGGLE_SIMULATIONS_SELECTED,
  REQUEST_VARIABLE,
  RECEIVE_VARIABLE,
  SET_SCATTERPLOT_WIDTH,
  SET_SCATTERPLOT_HEIGHT,
  SET_TABLE_WIDTH,
  SET_TABLE_HEIGHT,
  SET_BARPLOT_WIDTH,
  SET_BARPLOT_HEIGHT,
} from './actions';
import {
  SET_COLORMAP,
} from 'components/actionsColor';

const initialState = {
  colormap: 'night', // String reprsenting current color map
  simulations_selected: [], // Array containing which simulations are selected. Empty for none.
  cca_component_selected: 0, // Number indicating the index of the selected CCA component.
  cca_component_sorted: null, // Number indicating the index of the sorted CCA component. Set to 'null' for no sort?
  cca_component_sort_direction: 'ascending', // String indicating sort direction of sorted CCA component. Set to 'null' for no sort?
  variable_selected: 0, // Number indicating the index of the selected variable. One always must be selected.
  variable_sorted: null, // Number indicating the index of the sorted variable. Set to 'null' for no sort?
  variable_sort_direction: 'ascending', // String indicating the sort direction of the sorted variable. Set to 'null' for no sort?
}

// This is the CCA reducer that takes the current state (or initial state if none passed) and an action
// and returns a new state tree. Must be a pure funtion - can't alter current state or have other observable 
// side effects.
export default function cca_reducer(state = initialState, action) {
  switch (action.type) {
    case SET_VARIABLE_SELECTED:
      return Object.assign({}, state, {
        variable_selected: action.id
      })
    case REQUEST_VARIABLE:
      return Object.assign({}, state, {
        derived: {
          ...state.derived,
          column_data: {
            ...state.derived.column_data,
            // We use ES6 computed property syntax so we can update column_data[action.variable] with Object.assign() in a concise way
            [action.variable]: {
              isFetching: true,
            }
          }
        }
      });
    case RECEIVE_VARIABLE:
      return Object.assign({}, state, {
        derived: {
          ...state.derived,
          column_data: {
            ...state.derived.column_data,
            // We use ES6 computed property syntax so we can update column_data[action.variable] with Object.assign() in a concise way
            [action.variable]: {
              isFetching: true,
              values: action.values,
            }
          }
        }
      });
    case SET_VARIABLE_SORTED:
      return Object.assign({}, state, {
        variable_sorted: action.id,
        // If the new sorted variable is the same as the previous sorted variable, it means
        // we need to reverse the sort order.
        // Otherwise we default to ascending because it makes most sense for the table
        variable_sort_direction: 
          state.variable_sorted == action.id ? 
            (state.variable_sort_direction == 'ascending' ? 'descending' : 'ascending')
            : 'ascending',
      })
    case SET_CCA_COMPONENT_SELECTED:
      return Object.assign({}, state, {
        cca_component_selected: action.id
      })
    case SET_CCA_COMPONENT_SORTED:
      return Object.assign({}, state, {
        cca_component_sorted: action.id,
        // If the new sorted component is the same as the previous sorted component, it means
        // we need to reverse the sort order.
        // Otherwise we default to descending because it makes most sense for CCA barplot
        cca_component_sort_direction: 
          state.cca_component_sorted == action.id ? 
            (state.cca_component_sort_direction == 'ascending' ? 'descending' : 'ascending')
            : 'descending',
      })
    case SET_SIMULATIONS_SELECTED:
      return Object.assign({}, state, {
        simulations_selected: action.simulations
      })
    case ADD_SIMULATIONS_SELECTED:
      return Object.assign({}, state, {
        simulations_selected: _.union(state.simulations_selected, action.simulations)
      })
    case REMOVE_SIMULATIONS_SELECTED:
      return Object.assign({}, state, {
        simulations_selected: _.without(state.simulations_selected, ...action.simulations)
      })
    case TOGGLE_SIMULATIONS_SELECTED:
      let add = _.difference(action.simulations, state.simulations_selected);
      let remove = _.intersection(state.simulations_selected, action.simulations);
      return Object.assign({}, state, {
        simulations_selected: _.without(_.union(state.simulations_selected, add), ...remove)
      })
    case SET_COLORMAP:
      return Object.assign({}, state, {
        colormap: action.name
      })
    case SET_SCATTERPLOT_WIDTH:
      return Object.assign({}, state, {
        derived: {
          ...state.derived,
          scatterplot_width: action.width,
        }
      })
    case SET_SCATTERPLOT_HEIGHT:
      return Object.assign({}, state, {
        derived: {
          ...state.derived,
          scatterplot_height: action.height,
        }
      })
    case SET_TABLE_WIDTH:
      return Object.assign({}, state, {
        derived: {
          ...state.derived,
          table_width: action.width,
        }
      })
    case SET_TABLE_HEIGHT:
      return Object.assign({}, state, {
        derived: {
          ...state.derived,
          table_height: action.height,
        }
      })
    case SET_BARPLOT_WIDTH:
      return Object.assign({}, state, {
        derived: {
          ...state.derived,
          barplot_width: action.width,
        }
      })
    case SET_BARPLOT_HEIGHT:
      return Object.assign({}, state, {
        derived: {
          ...state.derived,
          barplot_height: action.height,
        }
      })
    
    default:
      return state
  }
}
