// frontend/src/redux/actions.js
import * as types from './actionTypes';

export const generateAudioRequest = (text) => ({ type: types.GENERATE_AUDIO_REQUEST, payload: { text } });
export const generateAudioProgress = (percentage) => ({ type: types.GENERATE_AUDIO_PROGRESS, payload: { percentage } });
export const generateAudioSuccess = (fileId, downloadUrl) => ({ type: types.GENERATE_AUDIO_SUCCESS, payload: { fileId, downloadUrl } });
export const generateAudioFailure = (error) => ({ type: types.GENERATE_AUDIO_FAILURE, payload: { error } });

export const setTextInput = (text) => ({ type: types.SET_TEXT_INPUT, payload: { text } });
export const setEventsChannel = (eventSource) => ({ type: types.SET_EVENTS_CHANNEL, payload: { eventSource } });
export const clearEventsChannel = () => ({ type: types.CLEAR_EVENTS_CHANNEL });
export const resetGenerationState = () => ({ type: types.RESET_GENERATION_STATE });
