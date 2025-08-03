// app.js (Node.js Express Server)
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const AWS = require('aws-sdk');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const app = express();
const upload = multer({ dest: 'uploads/' });

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_KEY,
  secretAccessKey: process.env.AWS_SECRET,
  region: process.env.AWS_REGION
});

const lambda = new AWS.Lambda({ region: process.env.AWS_REGION });

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.render('upload');
});

app.post('/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  const emails = [];
  for (let i = 1; i <= 5; i++) {
    const email = req.body[`email${i}`];
    if (email) emails.push(email);
  }

  const fileContent = fs.readFileSync(file.path);
  const uniqueFileName = `${uuidv4()}_${file.originalname}`;
  const params = {
    Bucket: process.env.S3_BUCKET,
    Key: uniqueFileName,
    Body: fileContent
  };

  s3.upload(params, function (err, data) {
    if (err) return res.send("Error uploading file");

    const fileURL = data.Location;
    saveToDB(uniqueFileName, emails, fileURL);
    invokeLambda(uniqueFileName, emails, fileURL);
    fs.unlinkSync(file.path);
    res.render('success');
  });
});

function saveToDB(filename, emails, fileURL) {
  const dynamo = new AWS.DynamoDB.DocumentClient();
  const params = {
    TableName: process.env.DYNAMO_TABLE,
    Item: {
      fileID: filename,
      emails: emails,
      fileURL: fileURL,
      uploadedAt: new Date().toISOString(),
      clicks: {}
    }
  };

  dynamo.put(params, function (err, data) {
    if (err) console.error("DynamoDB error", err);
    else console.log("Saved to DynamoDB");
  });
}

function invokeLambda(filename, emails, fileURL) {
  const payload = {
    filename,
    emails,
    fileURL
  };

  const params = {
    FunctionName: process.env.LAMBDA_NAME,
    InvocationType: "Event",
    Payload: JSON.stringify(payload)
  };

  lambda.invoke(params, function (err, data) {
    if (err) console.error("Lambda invoke error:", err);
    else console.log("Lambda invoked");
  });
}

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});