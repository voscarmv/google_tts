// frontend/src/components/AudioGenerator.jsx
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setTextInput, generateAudioRequest } from '../redux/actions';

const AudioGenerator = () => {
  const dispatch = useDispatch();
  const { text, isGenerating, progress, downloadUrl, error } = useSelector(state => state); // Assuming audioReducer is root

  const handleTextChange = (e) => {
    dispatch(setTextInput(e.target.value));
  };

  const handleSubmit = () => {
    if (text.trim()) {
      dispatch(generateAudioRequest(text));
    }
  };

  return (
    <div>
      <h2>Google TTS Audio Generator</h2>
      
      <textarea
        value={text}
        onChange={handleTextChange}
        placeholder="Enter text to synthesize..."
        rows={5}
        cols={50}
        disabled={isGenerating}
      />
      <br />
      
      <button onClick={handleSubmit} disabled={isGenerating || !text.trim()}>
        {isGenerating ? `Generating... ${progress}%` : 'Generate Audio'}
      </button>
      
      {isGenerating && (
        <div>
          {/* Progress text is now part of the button or can be separate */}
          {/* <p>Progress: {progress}%</p> */}
          <progress value={progress} max="100" style={{ width: '100%', marginTop: '10px' }} />
        </div>
      )}
      
      {downloadUrl && !isGenerating && (
        <div style={{ marginTop: '10px' }}>
          <p>Audio ready!</p>
          <a href={downloadUrl} download="audio.mp3">
            Download Audio
          </a>
        </div>
      )}
      
      {error && (
        <div style={{ color: 'red', marginTop: '10px' }}>
          <p>Error: {error}</p>
        </div>
      )}
    </div>
  );
};

export default AudioGenerator;
