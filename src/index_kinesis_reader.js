
'use strict';

console.log('Loading function');

var region = process.env.AWS_DEFAULT_REGION;

var AWS = require('aws-sdk');
var cloudwatch = new AWS.CloudWatch({region: region});

exports.handler = (event, context, callback) => {
  var current = new Date();
  console.log('data:', current);
  console.log('event:', JSON.stringify(event));
  console.log('Received number of records:', event.Records.length);
  save(event.Records, 0, current, function(err, data) {
    if (err) {
      callback(err, null);
    }
    else {
      console.log(data);
      callback(null, data);
    }
  });
};

function save(records, idx, current, callback) {

  var record = records[idx];
  var payload = new Buffer(record.kinesis.data, 'base64').toString('ascii');
  console.log('Decoded payload of index [' + idx + ']: ' + payload);
  var payloadJson = JSON.parse(payload);
  console.log('IoT Rules Engine received a message at:', new Date(payloadJson.timestamp));
  var eventSource = record.eventSourceARN.split("/")[1].split("-")[4];

  // add metrics data
  var currentTimestamp = current.getTime();
  var elapsed = currentTimestamp - payloadJson.timestamp;
  var metrics = {
    MetricData: [
      {
        "MetricName": "MessageLatency",
        "Dimensions": [
          {
            "Name": "IoT_Proxy",
            "Value": eventSource
          }
        ],
        "Timestamp": current,
        "Unit": "Milliseconds",
        "Value": elapsed
      }
    ],
    Namespace: 'Transics'
  }
  console.log('metrics to save: ' + JSON.stringify(metrics))
  cloudwatch.putMetricData(metrics, function(err, data) {
    if (err) {
      console.log("failed to save metrics of record[" + idx + "] : " + err);
      callback(err, null);
    }
    else {
      console.log("successfully saved metrics of record[" + idx + "] : " + err);
      if (++idx == records.length) {
        callback(null, true);
      }
      else {
        save(records, idx, current, callback);
      }
    }
  });
}
