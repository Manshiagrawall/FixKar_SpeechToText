const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors());

// Setup storage engine for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

// Your AssemblyAI API Key
const assemblyApiKey = "ASSEMBLY_API_KEY"; // Replace with your AssemblyAI API key

// Route to upload and convert M4A to MP3
app.post('/upload', upload.single('file'), async (req, res) => {
  const uploadedFile = req.file;
  if (!uploadedFile) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const outputFilePath = `uploads/${Date.now()}-converted.mp3`;

  // Convert the uploaded M4A file to MP3 using FFmpeg
  ffmpeg(uploadedFile.path)
    .toFormat('mp3')
    .on('end', async () => {
      console.log('Conversion to MP3 completed');

      // Remove the original M4A file after conversion
      fs.unlink(uploadedFile.path, (err) => {
        if (err) console.error('Error removing original file:', err);
      });

      // Upload the MP3 file to AssemblyAI for transcription
      try {
        const uploadResponse = await axios.post(
          'https://api.assemblyai.com/v2/upload',
          fs.createReadStream(outputFilePath),
          {
            headers: {
              authorization: assemblyApiKey,
              'Content-Type': 'application/json',
            },
          }
        );

        const audioUrl = uploadResponse.data.upload_url;

        const transcriptResponse = await axios.post(
          'https://api.assemblyai.com/v2/transcript',
          {
            audio_url: audioUrl,
          },
          {
            headers: {
              authorization: assemblyApiKey,
            },
          }
        );

        const transcriptId = transcriptResponse.data.id;

        // Send back the transcript ID to the frontend
        res.json({
          success: true,
          transcript_id: transcriptId,
          mp3_url: `${req.protocol}://${req.get('host')}/${outputFilePath}`,
        });
      } catch (error) {
        console.error('Error uploading to AssemblyAI:', error);
        res.status(500).json({ error: 'Failed to upload to AssemblyAI' });
      }
    })
    .on('error', (err) => {
      console.error('Error during conversion:', err);
      res.status(500).json({ error: 'Failed to convert file' });
    })
    .save(outputFilePath); // Save the output MP3 file to 'uploads'
});

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
