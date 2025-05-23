// frontend/src/redux/sagas.js
import { call, put, takeLatest, all, fork, cancel, take, race } from 'redux-saga/effects';
import { eventChannel, END } from 'redux-saga';
import axios from 'axios';
import * as types from './actionTypes';
import {
  generateAudioProgress,
  generateAudioSuccess,
  generateAudioFailure,
  setEventsChannel,
  clearEventsChannel,
  resetGenerationState
} from './actions';

const API_BASE_URL = 'http://localhost:3001/api'; // Assuming backend runs on port 3001

// Worker Saga: Makes API call to generate audio
function* generateAudioApiCall(action) {
  try {
    const { text } = action.payload;
    // Before starting a new request, dispatch reset to clear previous state/SSE
    yield put(resetGenerationState()); // Clears previous downloadUrl, errors, progress
                                     // and also closes any existing eventSource via reducer.

    const response = yield call(axios.post, `${API_BASE_URL}/generate-audio`, { text });
    const { fileId, eventsUrl } = response.data;

    // Start listening to SSE events
    const sseTask = yield fork(watchSseEvents, fileId, `${API_BASE_URL}${eventsUrl}`);
    
    // Store the task to be able to cancel it if needed (e.g. new request comes)
    // This is implicitly handled by takeLatest if it cancels previous task which includes its forks.
    // However, explicit SET_EVENTS_CHANNEL with task or EventSource might be useful.
    // For now, reducer handles EventSource object itself.

  } catch (error) {
    const errorMessage = error.response ? error.response.data.error : error.message;
    yield put(generateAudioFailure(errorMessage || 'Failed to connect to the server.'));
  }
}

// Worker Saga: Manages Server-Sent Events
function* watchSseEvents(fileId, eventsUrl) {
  const source = new EventSource(eventsUrl);
  yield put(setEventsChannel(source)); // Store the source in Redux state so reducer can close it

  const channel = eventChannel(emitter => {
    source.onmessage = (event) => {
      // Generic message handler if backend sends non-typed messages
      // console.log('SSE generic message:', event.data);
    };

    source.addEventListener('connected', (event) => {
      console.log('SSE Connected:', JSON.parse(event.data));
      // You could dispatch an action here if needed
    });

    source.addEventListener('progress', (event) => {
      const data = JSON.parse(event.data);
      emitter({ type: types.GENERATE_AUDIO_PROGRESS, percentage: data.percentage });
    });

    source.addEventListener('complete', (event) => {
      const data = JSON.parse(event.data);
      emitter({ type: types.GENERATE_AUDIO_SUCCESS, fileId, downloadUrl: `${API_BASE_URL}${data.downloadUrl}` });
      emitter(END); // Signal end of channel
    });

    source.addEventListener('error', (event) => {
      // Try to parse event.data if it exists, otherwise provide a default error message
      let errorMsg = 'SSE connection error.';
      if (event.data) {
          try {
              const parsedError = JSON.parse(event.data);
              errorMsg = parsedError.message || parsedError.details || errorMsg;
          } catch (e) {
              // If event.data is not valid JSON, use it as string or default
              errorMsg = typeof event.data === 'string' ? event.data : errorMsg;
          }
      } else if (event.message) { // Some SSE errors might just have a message property on the event itself
          errorMsg = event.message;
      }
      emitter({ type: types.GENERATE_AUDIO_FAILURE, error: errorMsg });
      emitter(END); // Signal end of channel on error
    });
    
    // The subscriber must return an unsubscribe function
    return () => {
      // This is called when the channel is closed or taken from
      // Handled by CLEAR_EVENTS_CHANNEL action and reducer.
      // source.close(); // Reducer handles this via clearEventsChannel action
    };
  });

  try {
    while (true) {
      const eventAction = yield take(channel);
      if (eventAction.type === types.GENERATE_AUDIO_PROGRESS) {
        yield put(generateAudioProgress(eventAction.percentage));
      } else if (eventAction.type === types.GENERATE_AUDIO_SUCCESS) {
        yield put(generateAudioSuccess(eventAction.fileId, eventAction.downloadUrl));
        yield put(clearEventsChannel()); // This will close the source via reducer
      } else if (eventAction.type === types.GENERATE_AUDIO_FAILURE) {
        yield put(generateAudioFailure(eventAction.error));
        yield put(clearEventsChannel()); // This will close the source via reducer
      }
    }
  } finally {
    // This block executes when the saga is cancelled (e.g. by takeLatest)
    // Or when channel emits END
    console.log('Exiting SSE watcher, channel may have been closed or saga cancelled.');
    if (channel && !channel.isClosed()) { // Check if channel is defined and not closed
         channel.close(); // Ensure channel is closed if saga is cancelled externally
    }
    // The EventSource itself should be closed by the clearEventsChannel action's effect in the reducer.
    // If this finally block is reached due to an external cancellation (like takeLatest),
    // and clearEventsChannel hasn't been dispatched yet (e.g. operation was still in progress),
    // dispatch it here to ensure the EventSource is closed.
    // However, if clearEventsChannel was already dispatched (e.g. on success/failure from channel),
    // dispatching it again is fine as the reducer checks if state.eventSource exists.
    yield put(clearEventsChannel());
  }
}

// Watcher Saga: Listens for GENERATE_AUDIO_REQUEST
function* watchGenerateAudioRequest() {
  yield takeLatest(types.GENERATE_AUDIO_REQUEST, generateAudioApiCall);
}

// Root Saga
export default function* rootSaga() {
  yield all([
    watchGenerateAudioRequest(),
    // Add other watcher sagas here if any
  ]);
}
