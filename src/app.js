'use strict';

const apiai = require('apiai');
const express = require('express');
const bodyParser = require('body-parser');
const uuid = require('node-uuid');
const request = require('request');
const JSONbig = require('json-bigint');
const async = require('async');

const REST_PORT = (process.env.PORT || 5000);
const APIAI_ACCESS_TOKEN = process.env.APIAI_ACCESS_TOKEN;
const APIAI_LANG = process.env.APIAI_LANG || 'en';
const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

const apiAiService = apiai(APIAI_ACCESS_TOKEN, {language: APIAI_LANG, requestSource: "fb"});
const sessionIds = new Map();

function processEvent(event) {
    var sender = event.sender.id.toString();

    if (event.message && event.message.text) {
        var text = event.message.text;
        // Handle a text message from this sender

        if (!sessionIds.has(sender)) {
            sessionIds.set(sender, uuid.v1());
        }

        //console.log("Text from Facebook messenger:", text);

        //console.log("Sending the text entered in Facebook Messenger to out api.ai agent to make sense out of it");

        let apiaiRequest = apiAiService.textRequest(text,
            {
                sessionId: sessionIds.get(sender)
            });

        apiaiRequest.on('response', (response) => {
            if (isDefined(response.result)) {

                //console.log("Emmett: got result from api.ai - " +JSON.stringify(response, null, 2));


                if(response.result && response.result.parameters){
                    //console.log('....test:' +JSON.stringify(response.result.parameters));
                    if(response.result.parameters['geo-city-us']){
                        //console.log('city:'+response.result.parameters['geo-city-us']);
                    }
                    if(response.result.parameters['productType']){
                        //console.log('productType:'+response.result.parameters['productType']);
                    }

                }


                //console.log('fulfillment.data:'+response.result.fulfillment.data);

                let responseText = response.result.fulfillment.speech;
                let responseData = response.result.fulfillment.data;

                let action = response.result.action;
                let customText;
                let image;

                //console.log('action is '+action);
                switch (action){

                    //TODO
                    case 'getProductsByProductTypeAndLocation':
                        customText = getProductsByProductTypeAndLocation('','');
                        //console.log('extraText is '+customText);
                        break;

                    case 'getCouponByProductId':
                        image = getCouponByProductId(1);
                        break;
                    default:

                }


                if (isDefined(responseData) && isDefined(responseData.facebook)) {
                    try {
                        console.log('Response as formatted message');
                        sendFBMessage(sender, responseData.facebook);



                    } catch (err) {
                        sendFBMessage(sender, {text: err.message });
                    }
                } else if (isDefined(responseText)) {
                    console.log('Response as text message');
                    // facebook API limit for text length is 320,
                    // so we split message if needed
                    var splittedText = splitResponse(responseText);

                    if(customText){
                        console.log('sending extra info');
                        splittedText.push(customText);
                    }

                    async.eachSeries(splittedText, (textPart, callback) => {
                        sendFBMessage(sender, {text: textPart}, callback);
                    });


                }




            }
        });

        apiaiRequest.on('error', (error) => console.error(error));
        apiaiRequest.end();
    }
}


function getProductsByProductTypeAndLocation(productType, location){
    return "We found x,y and z products";
}

function getCouponByProductId(productId){
    return null;
}

function splitResponse(str) {
    if (str.length <= 320)
    {
        return [str];
    }

    var result = chunkString(str, 300);

    return result;

}

function chunkString(s, len)
{
    var curr = len, prev = 0;

    var output = [];

    while(s[curr]) {
        if(s[curr++] == ' ') {
            output.push(s.substring(prev,curr));
            prev = curr;
            curr += len;
        }
        else
        {
            var currReverse = curr;
            do {
                if(s.substring(currReverse - 1, currReverse) == ' ')
                {
                    output.push(s.substring(prev,currReverse));
                    prev = currReverse;
                    curr = currReverse + len;
                    break;
                }
                currReverse--;
            } while(currReverse > prev)
        }
    }
    output.push(s.substr(prev));
    return output;
}

function sendFBMessage(sender, messageData, callback) {
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token: FB_PAGE_ACCESS_TOKEN},
        method: 'POST',
        json: {
            recipient: {id: sender},
            message:{
                "attachment":{
                    "type":"template",
                    "payload":{
                        "template_type":"generic",
                        "elements":[
                            {
                                "title":"Classic White T-Shirt",
                                "image_url":"http://petersapparel.parseapp.com/img/item100-thumb.png",
                                "subtitle":"Soft white cotton t-shirt is back in style",
                                "buttons":[
                                    {
                                        "type":"web_url",
                                        "url":"http://bot-mediator.herokuapp.com/NY/BK.jpg",
                                        "title":"View Item"
                                    },
                                    {
                                        "type":"web_url",
                                        "url":"http://bot-mediator.herokuapp.com/NY/BK.jpg",
                                        "title":"Buy Item"
                                    },
                                    {
                                        "type":"postback",
                                        "title":"Bookmark Item",
                                        "payload":"USER_DEFINED_PAYLOAD_FOR_ITEM100"
                                    }
                                ]
                            },
                            {
                                "title":"Classic Grey T-Shirt",
                                "image_url":"http://bot-mediator.herokuapp.com/NY/BK.jpg",
                                "subtitle":"Soft gray cotton t-shirt is back in style",
                                "buttons":[
                                    {
                                        "type":"web_url",
                                        "url":"http://bot-mediator.herokuapp.com/NY/BK.jpg",
                                        "title":"View Item"
                                    },
                                    {
                                        "type":"web_url",
                                        "url":"http://bot-mediator.herokuapp.com/NY/BK.jpg",
                                        "title":"Buy Item"
                                    },
                                    {
                                        "type":"postback",
                                        "title":"Bookmark Item",
                                        "payload":"USER_DEFINED_PAYLOAD_FOR_ITEM101"
                                    }
                                ]
                            }
                        ]
                    }
                }
            }



        }
    }, function (error, response, body) {
        if (error) {
            console.log('Error sending message: ', error);
        } else if (response.body.error) {
            console.log('Error: ', response.body.error);
        }

        if (callback) {
            callback();
        }
    });
}

function doSubscribeRequest() {
    request({
            method: 'POST',
            uri: "https://graph.facebook.com/v2.6/me/subscribed_apps?access_token=" + FB_PAGE_ACCESS_TOKEN
        },
        function (error, response, body) {
            if (error) {
                console.error('Error while subscription: ', error);
            } else {
                console.log('Subscription result: ', response.body);
            }
        });
}

function isDefined(obj) {
    if (typeof obj == 'undefined') {
        return false;
    }

    if (!obj) {
        return false;
    }

    return obj != null;
}

const app = express();

app.use(bodyParser.text({ type: 'application/json' }));

app.use(express.static('public'));

app.get('/webhook/', function (req, res) {

    //console.log('checking params');
    //console.log('webhook request query:' +JSON.stringify(req.params));

    if (req.query['hub.verify_token'] == FB_VERIFY_TOKEN) {
        res.send(req.query['hub.challenge']);
        
        setTimeout(function () {
            doSubscribeRequest();
        }, 3000);
    } else {
        res.send('Error, wrong validation token');
    }
});

app.post('/webhook/', function (req, res) {
    try {

        console.log('post data' + JSON.stringify(req.body));
        var data = JSONbig.parse(req.body);



        var messaging_events = data.entry[0].messaging;
        for (var i = 0; i < messaging_events.length; i++) {
            var event = data.entry[0].messaging[i];
            processEvent(event);
        }
        return res.status(200).json({
            status: "ok"
        });
    } catch (err) {
        return res.status(400).json({
            status: "error",
            error: err
        });
    }

});

app.listen(REST_PORT, function () {
    console.log('Rest service ready on port ' + REST_PORT);
});

doSubscribeRequest();