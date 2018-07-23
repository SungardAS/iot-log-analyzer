
'use strict';

const zlib = require('zlib');
var region = process.env.AWS_DEFAULT_REGION;

var AWS = require('aws-sdk');
var cloudwatch = new AWS.CloudWatch({region: region});

//var topics = {}
var traces = {}

//timestamp":"2018-07-22 21:26:06.621",
//"logLevel":"ERROR",
//"traceId":"74effb87-51a9-98a5-45d1-e677d353d940",
//"accountId":"745968232654",
//"status":"Failure",
//"eventType":"RuleExecution",
//"clientId":"sgas-shadow/ShadowRuleDevice/in",
//"topicName":"sgas-shadow/ShadowRuleDevice/in",
//"ruleName":"iot_analyzer_rule_shadow",
//"ruleAction":"OperatorEval",
//"resources":{"Operator":"="},
//"principalId":"7a3701a01bed4c80e97a1212b3f76de6030d67341abcc74b4d2e3c8380f54a01",
//"details":"Undefined',
//'3': 'result"

const EVENT_PUBLISH_IN = "Publish-In";
const EVENT_RULE_MATCH = "RuleMatch";
const EVENT_STARTING_RULE_EXECUTION = "StartingRuleExecution";
//const EVENT_FUNCTION_EXECUTION = "FunctionExecution";
const EVENT_RULE_EXECUTION = "RuleExecution";


//const ATTR_TOPIC_NAME = "topicName:";
//const ATTR_PRINCIPAL_ID = "principalId:";
//const ATTR_EVENT = "eventType:";
//const ATTR_EVENT_OPERATOR_EVAL = "EVENT:OperatorEval";
//const ATTR_EVENT_WHERE_EVAL = "EVENT:WhereEval";
const ATTR_STATUS = "status";

//const PUBLISH_EVENT = "Publish-In";
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
        //console.log(JSON.stringify(local_events));
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

/*function find_topic(principal_id, topic_name, event_timestamp) {
  var target_topic = null;
  for(var idx = 0; idx < topics.length; idx++) {
    var topic = topics[principal_id][idx];
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
*/
function save(logEvents, idx, local_events, callback) {

  var extractedFields = logEvents[idx].extractedFields;
  //console.log(extractedFields);

  // build the input json
  var msg = "";
  Object.keys(extractedFields).forEach(function(key) { msg += extractedFields[key] + " "; });
  msg = JSON.parse(msg);
  console.log(msg);

  //if (!(ATTR_TOPIC_NAME in msg) || !(ATTR_PRINCIPAL_ID in msg)) {
  //if (!(ATTR_TOPIC_NAME in msg) || msg[ATTR_STATUS] != STATUS_SUCCESS) {
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
  //var principal_id = msg[ATTR_PRINCIPAL_ID];
  var topic_name = msg.topicName;
  var event_name = msg.eventType;
  var status = msg.status;

  /*if (event_name === PUBLISH_EVENT || !(topic_name in topics)) {
    topics[topic_name] = [];
  }*/
  if (!(trace_id in traces)) {
    traces[trace_id] = [];
  }
  /*if (!(trace_id in local_events)) {
    local_events[trace_id] = []
  }*/
  var new_event = {};
  new_event.timestamp = event_timestamp;
  new_event.name = event_name;
  new_event.topic_name = topic_name;
  new_event.status = status;
  //local_events[trace_id].push(new_event);
  traces[trace_id].push(new_event);
  /*if (event_name in traces[trace_id]) {
    add_metrics(traces[trace_id], function(err, data) {
      if (err) {
        console.log("failed to add_metrics of " + topic_name + ": " + err);
      }
    });
    traces[trace_id] = {}
  }
  else {
    traces[trace_id][event_name] = new_event;
  }*/
  //topics[topic_name].push(new_event);

  /*if (event_name === PUBLISH_EVENT) {
    if (++idx == logEvents.length) {
      return callback(null, true);
    }
    else {
      return save(logEvents, idx, local_events, callback);
    }
  }
  else {*/
    //add_metric(topic_name, function(err, data) {
    /*add_metric(new_event, function(err, data) {
      if (err) {
        console.log("failed to add_metrics of " + topic_name + ": " + err);
        return callback(err, null);
      }
      else {*/
        if (++idx == logEvents.length) {
          return callback(null, true);
        }
        else {
          return save(logEvents, idx, local_events, callback);
        }
      /*}
    });*/
  //}
}

/*function sortProperties(obj)
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
}*/

function validate_trace(trace) {
  var valid = false;
  for(var idx = 0; idx < EVENTS.length; idx++) {

  }
}

function add_metrics(keys, idx, callback) {

  var events = traces[keys[idx]];
  /*var failed = events.filter(function(event) {
    return event.status != STATUS_SUCCESS;
  });*/
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

  /*if (failed[0]) {
    console.log("There is at least one failed event: " + keys[idx]);
    delete traces[keys[idx]];
    if (++idx == keys.length) {
      return callback(null, true);
    }
    else {
      return add_metrics(keys, idx, callback);
    }
  }
  else */if (publish_in[0] && rule_match[0] && rule_starting_rule_execution[0] && rule_execution[0]) {
    //events.sort(function(obj1, obj2) {return (new Date(obj1.timestamp)).getTime() - (new Date(obj2.timestamp)).getTime()})
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
  //var topic = local_events[topic_name][idx];
  //var sorted_attrs = sortProperties(topic);
  //if (sorted_attrs.length > 1) {
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
  //}
  //else {
  //  return callback(null, true);
  //}
}

//function add_metric(topic_name, callback) {
function add_metric(event1, event2, callback) {
  //var topic = topics[topic_name]
  //var event_len = topics[topic_name].length
  //console.log(new_event)
  var metrics = {
    MetricData: [
      {
        "MetricName": event1.name + "_" + event2.name,
        //"MetricName": new_event.name,
        "Dimensions": [
          {
            "Name": "TopicName",
            "Value": event1.topic_name
          }
        ],
        "Timestamp": new Date(),
        "Unit": "Milliseconds",
        "Value": (new Date(event2.timestamp)).getTime() - (new Date(event1.timestamp)).getTime()
        //"Value": new Date(new_event.timestamp).getTime()
      }
    ],
    Namespace: 'IoTEvent'
  };
  console.log('metrics to save: ' + JSON.stringify(metrics));
  cloudwatch.putMetricData(metrics, callback);
}
