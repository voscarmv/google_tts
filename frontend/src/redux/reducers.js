// frontend/src/redux/reducers.js
import * as types from './actionTypes';

const initialState = {
  text: '',
  isGenerating: false,
  progress: 0,
  fileId: null,
  downloadUrl: null,
  error: null,
  eventSource: null,
};

const audioReducer = (state = initialState, action) => {
  switch (action.type) {
    case types.SET_TEXT_INPUT:
      return { ...state, text: action.payload.text };
    case types.GENERATE_AUDIO_REQUEST:
      return {
        ...state,
        isGenerating: true,
        progress: 0,
        fileId: null,
        downloadUrl: null,
        error: null,
        // text: action.payload.text // Text is already set by SET_TEXT_INPUT if needed before request
      };
    case types.GENERATE_AUDIO_PROGRESS:
      return { ...state, progress: action.payload.percentage };
    case types.GENERATE_AUDIO_SUCCESS:
      return {
        ...state,
        isGenerating: false,
        progress: 100,
        fileId: action.payload.fileId,
        downloadUrl: action.payload.downloadUrl,
        error: null,
      };
    case types.GENERATE_AUDIO_FAILURE:
      return {
        ...state,
        isGenerating: false,
        error: action.payload.error,
        eventSource: null, // Ensure eventSource is cleared on failure
      };
    case types.SET_EVENTS_CHANNEL:
      return { ...state, eventSource: action.payload.eventSource };
    case types.CLEAR_EVENTS_CHANNEL:
      if (state.eventSource) {
        state.eventSource.close(); // Close the actual EventSource connection
      }
      return { ...state, eventSource: null };
    case types.RESET_GENERATION_STATE:
        // Optionally preserve text input or clear it as well
        return { 
            ...initialState,
            text: state.text // Example: preserve text input
        };
    default:
      return state;
  }
};

export default audioReducer; // This will be our rootReducer for now
