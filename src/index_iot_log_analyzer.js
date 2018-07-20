
'use strict';

const zlib = require('zlib');
var region = process.env.AWS_DEFAULT_REGION;

var AWS = require('aws-sdk');
var cloudwatch = new AWS.CloudWatch({region: region});

const ATTR_TOPICNAME = "TOPICNAME:";
const ATTR_EVENT = "EVENT:";
const ATTR_EVENT_OPERATOR_EVAL = "EVENT:OperatorEval";
const ATTR_EVENT_WHERE_EVAL = "EVENT:WhereEval";

const PUBLISH_EVENT = "PublishEvent";
const ACTION_SUCCESS_EVENT_POSTFIX = "ActionSuccess";

exports.handler = (event, context, callback) => {
    const payload = new Buffer(event.awslogs.data, 'base64');
    zlib.gunzip(payload, (err, res) => {
        if (err) {
            return callback(err);
        }
        const parsed = JSON.parse(res.toString('utf8'));
        var local_events = {};
        save(parsed.logEvents, 0, local_events, function(err, data) {
          if (err) {
            callback(err, null);
          }
          else {
            console.log(JSON.stringify(local_events));
            add_metrics(local_events, Object.keys(local_events), 0, function(err, data) {
              if (err) {
                callback(err, null);
              }
              else {
                callback(null, data);
              }
            });
            callback(null, data);
          }
        });
    });
};

function find_topic(given_events, topic_name, event_timestamp) {
  var target_topic = null;
  for(var idx = 0; idx < given_events[topic_name].length; idx++) {
    var topic = given_events[topic_name][idx];
    if (topic.PUBLISH_EVENT > event_timestamp)  break;
    else {
      target_topic = topic;
    }
  }
  if (target_topic == null && given_events[topic_name].length > 0){
    target_topic = given_events[topic_name][0];
  }
  return target_topic;
}

function save(logEvents, idx, local_events, callback) {

  var extractedFields = logEvents[idx].extractedFields;
  console.log(extractedFields);

  if (extractedFields.topic_name.indexOf(ATTR_TOPICNAME) < 0
      || extractedFields.event === ATTR_EVENT_OPERATOR_EVAL
      || extractedFields.event === ATTR_EVENT_WHERE_EVAL) {
    if (++idx == logEvents.length) {
      return callback(null, true);
    }
    else {
      return save(logEvents, idx, local_events, callback);
    }
  }

  var event_datetime = new Date(extractedFields.date + " " + extractedFields.time);
  var event_timestamp = event_datetime.getTime();
  var topic_name = extractedFields.topic_name.replace(ATTR_TOPICNAME, "");
  var event_name = extractedFields.event.replace(ATTR_EVENT, "");

  if (!(topic_name in local_events)) {
    local_events[topic_name] = [];
  }
  if (event_name === PUBLISH_EVENT || local_events[topic_name].length == 0) {
    var new_topic = {};
    new_topic[event_name] = event_timestamp;
    local_events[topic_name].push(new_topic);
  }
  else {
    var target_topic = find_topic(local_events, topic_name, event_timestamp);
    target_topic[event_name] = event_timestamp;
  }

  if (++idx == logEvents.length) {
    return callback(null, true);
  }
  else {
    return save(logEvents, idx, local_events, callback);
  }
}

function sortProperties(obj)
{
  // convert object into array
	var sortable=[];
	for(var key in obj)
		if(obj.hasOwnProperty(key))
			sortable.push([key, obj[key]]); // each item is an array in format [key, value]

	// sort items by value
	sortable.sort(function(a, b)
	{
	  return a[1]-b[1]; // compare numbers
	});
	return sortable; // array in format [ [ key1, val1 ], [ key2, val2 ], ... ]
}

function add_metrics(local_events, keys, idx, callback) {
  add_topic_metrics(keys[idx], local_events, 0, function(err, data) {
    if (err) {
      console.log("failed to add_metrics of " + keys[idx] + ": " + err);
      return callback(err, null);
    }
    else {
      console.log("successfully completed add_metrics of " + keys[idx]);
      if (++idx == keys.length) {
        return callback(null, true);
      }
      else {
        return add_metrics(local_events, keys, idx, callback);
      }
    }
  });
}

function add_topic_metrics(topic_name, local_events, idx, callback) {
  var topic = local_events[topic_name][idx];
  var sorted_attrs = sortProperties(topic);
  if (sorted_attrs.length > 1) {
    add_metric(topic_name, sorted_attrs, 1, function(err, data) {
      if (err) {
        console.log("failed to add_topic_metrics[" + idx + "] of topic[" + topic_name + "]: " + err);
        return callback(err, null);
      }
      else {
        console.log("successfully completed add_topic_metrics[" + idx + "] of topic[" + topic_name + "]");
        if (++idx == local_events[topic_name].length) {
          return callback(null, true);
        }
        else {
          return add_topic_metrics(topic_name, local_events, idx, callback);
        }
      }
    });
  }
  else {
    return callback(null, true);
  }
}

function add_metric(topic_name, sorted_attrs, idx, callback) {
  var metrics = {
    MetricData: [
      {
        "MetricName": sorted_attrs[idx-1][0] + "_" + sorted_attrs[idx][0],
        "Dimensions": [
          {
            "Name": "TopicName",
            "Value": topic_name.split('/')[0]
          }
        ],
        "Timestamp": new Date(),
        "Unit": "Milliseconds",
        "Value": sorted_attrs[idx][1] - sorted_attrs[idx-1][1]
      }
    ],
    Namespace: 'Transics'
  };
  console.log('metrics to save: ' + JSON.stringify(metrics));
  cloudwatch.putMetricData(metrics, function(err, data) {
    if (err) {
      console.log("failed to save metrics of sorted_attrs[" + idx + "]: " + err);
      return callback(err, null);
    }
    else {
      console.log("successfully saved metrics of sorted_attrs[" + idx + "]");
      if (++idx == sorted_attrs.length) {
        return callback(null, true);
      }
      else {
        return add_metric(topic_name, sorted_attrs, idx, callback);
      }
    }
  });
}
