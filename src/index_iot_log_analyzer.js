
'use strict';

const zlib = require('zlib');
var region = process.env.AWS_DEFAULT_REGION;

var AWS = require('aws-sdk');
var cloudwatch = new AWS.CloudWatch({region: region});

var traces = {}

const EVENT_PUBLISH_IN = "Publish-In";
const EVENT_RULE_MATCH = "RuleMatch";
const EVENT_STARTING_RULE_EXECUTION = "StartingRuleExecution";
const EVENT_RULE_EXECUTION = "RuleExecution";

const ATTR_STATUS = "status";
const STATUS_SUCCESS = "Success";

exports.handler = (event, context, callback) => {
  //console.log(JSON.stringify(event));
  const payload = new Buffer(event.awslogs.data, 'base64');
  zlib.gunzip(payload, (err, res) => {
    if (err) {
        return callback(err);
    }
    const parsed = JSON.parse(res.toString('utf8'));
    console.log(parsed);
    var local_events = {};
    save(parsed.logEvents, 0, local_events, function(err, data) {
      if (err) {
        callback(err, null);
      }
      else {
        console.log(JSON.stringify(traces));
        if (Object.keys(traces).length > 0) {
          add_metrics(Object.keys(traces), 0, function(err, data) {
            if (err) {
              callback(err, null);
            }
            else {
              callback(null, data);
            }
          });
          callback(null, data);
        }
        else {
          callback(null, true);
        }
      }
    });
  });
};

function save(logEvents, idx, local_events, callback) {

  var extractedFields = logEvents[idx].extractedFields;
  //console.log(extractedFields);

  // build the input json
  var msg = "";
  Object.keys(extractedFields).forEach(function(key) { msg += extractedFields[key] + " "; });
  msg = JSON.parse(msg);
  console.log(msg);

  if (!('topicName' in msg)) {
    if (++idx == logEvents.length) {
      return callback(null, true);
    }
    else {
      return save(logEvents, idx, local_events, callback);
    }
  }

  var trace_id = msg.traceId;
  var event_timestamp = msg.timestamp;
  var topic_name = msg.topicName;
  var event_name = msg.eventType;
  var status = msg.status;

  if (!(trace_id in traces)) {
    traces[trace_id] = [];
  }

  var new_event = {};
  new_event.timestamp = event_timestamp;
  new_event.name = event_name;
  new_event.topic_name = topic_name;
  new_event.status = status;
  traces[trace_id].push(new_event);

  if (++idx == logEvents.length) {
    return callback(null, true);
  }
  else {
    return save(logEvents, idx, local_events, callback);
  }
}

function validate_trace(trace) {
  var valid = false;
  for(var idx = 0; idx < EVENTS.length; idx++) {

  }
}

function add_metrics(keys, idx, callback) {

  var events = traces[keys[idx]];

  var publish_in = events.filter(function(event) {
    return event.name === EVENT_PUBLISH_IN && event.status === STATUS_SUCCESS;
  });
  var rule_match = events.filter(function(event) {
    return event.name === EVENT_RULE_MATCH && event.status === STATUS_SUCCESS;
  });
  var rule_starting_rule_execution = events.filter(function(event) {
    return event.name === EVENT_STARTING_RULE_EXECUTION && event.status === STATUS_SUCCESS;
  });
  var rule_execution = events.filter(function(event) {
    return event.name === EVENT_RULE_EXECUTION && event.status === STATUS_SUCCESS;
  });

  if (publish_in[0] && rule_match[0] && rule_starting_rule_execution[0] && rule_execution[0]) {
    events = [publish_in[0], rule_match[0], rule_starting_rule_execution[0], rule_execution[0]];
    add_topic_metrics(events, 1, function(err, data) {
      if (err) {
        console.log("failed to add_metrics of " + keys[idx] + ": " + err);
      }
      else {
        console.log("successfully completed add_metrics of " + keys[idx]);
        delete traces[keys[idx]];
      }
      if (++idx == keys.length) {
        return callback(null, true);
      }
      else {
        return add_metrics(keys, idx, callback);
      }
    });
  }
  else {
    console.log("Events are not fully executed: " + keys[idx]);
    if (++idx == keys.length) {
      return callback(null, true);
    }
    else {
      return add_metrics(keys, idx, callback);
    }
  }
}

function add_topic_metrics(events, idx, callback) {
  var topic_name = events[idx].topic_name;
  add_metric(events[idx-1], events[idx], function(err, data) {
    if (err) {
      console.log("failed to add_topic_metrics[" + idx + "] of topic[" + topic_name + "]: " + err);
      return callback(err, null);
    }
    else {
      console.log("successfully completed add_topic_metrics[" + idx + "] of topic[" + topic_name + "]");
      if (++idx == events.length) {
        return callback(null, true);
      }
      else {
        return add_topic_metrics(events, idx, callback);
      }
    }
  });
}

function add_metric(event1, event2, callback) {
  var metrics = {
    MetricData: [
      {
        "MetricName": event1.name + "_" + event2.name,
        "Dimensions": [
          {
            "Name": "TopicName",
            "Value": event1.topic_name
          }
        ],
        "Timestamp": new Date(),
        "Unit": "Milliseconds",
        "Value": (new Date(event2.timestamp)).getTime() - (new Date(event1.timestamp)).getTime()
      }
    ],
    Namespace: 'IoTEvent'
  };
  console.log('metrics to save: ' + JSON.stringify(metrics));
  cloudwatch.putMetricData(metrics, callback);
}
