// frontend/src/redux/store.js
import { createStore, applyMiddleware } from 'redux';
import createSagaMiddleware from 'redux-saga';
import audioReducer from './reducers';
import rootSaga from './sagas'; // Import rootSaga

const sagaMiddleware = createSagaMiddleware();

const store = createStore(
  audioReducer, // Using audioReducer as the root reducer for now
  applyMiddleware(sagaMiddleware)
);

sagaMiddleware.run(rootSaga); // Run the root saga

export default store;
