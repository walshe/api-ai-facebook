'use strict';

const apiai = require('apiai');
const express = require('express');
const bodyParser = require('body-parser');
const uuid = require('node-uuid');
const request = require('request');
const JSONbig = require('json-bigint');
const async = require('async');
const _ = require('underscore');

const REST_PORT = (process.env.PORT || 5000);
const APIAI_ACCESS_TOKEN = process.env.APIAI_ACCESS_TOKEN;
const APIAI_LANG = process.env.APIAI_LANG || 'en';
const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

const apiAiService = apiai(APIAI_ACCESS_TOKEN, {language: APIAI_LANG, requestSource: "fb"});
const sessionIds = new Map();


const API_AI = 'Api.ai';
const MS_LUIS = 'LUIS';

var agent = "MS_LUIS";

var db = {
    restaurant : [
        {
            productId: 1,
            name: "5 Napkin Burger",
            city: "New York",
            url: "http://5napkinburger.com/",
            image: "http://bot-mediator.herokuapp.com/UWS/Logo_Restaurants/5%20Napkin%20Burger/5%20Napkin%20Logo.jpg",
            coupon: "http://bot-mediator.herokuapp.com/UWS/Logo_Restaurants/QR_Code_Coupon/images.png"
        },
        {
            productId: 2,
            name: "PJ Clarke's",
            city: "New York",
            url: "http://pjclarkes.com/",
            image: "http://www.crainsnewyork.com/apps/pbcsi.dll/storyimage/CN/20100110/SMALLBIZ/301109968/AR/0/P.J.-Clarke's&imageversion=widescreen&maxw=770",
            coupon: "http://bot-mediator.herokuapp.com/UWS/Logo_Restaurants/QR_Code_Coupon/images.png"
        },
        {
            productId: 3,
            name: "McDonalds",
            city: "Boston",
            url: "http://www.mcdonalds.com/us/en/home.html",
            image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Mcdonalds-90s-logo.svg/2000px-Mcdonalds-90s-logo.svg.png",
            coupon: "http://bot-mediator.herokuapp.com/UWS/Logo_Restaurants/QR_Code_Coupon/images.png"
        }
    ],

    clothing : [
        {
            productId: 4,
            name: "The Gap",
            city: "New York",
            url: "http://www.gap.com/",
            image: "https://lh6.ggpht.com/LKRb7hffPEcZOvKWHUpGo-7ajEYkcMXQw8ewHldpydXfl0hG2K4Ae35NxffRmUU4LZmM=w300",
            coupon: "http://bot-mediator.herokuapp.com/UWS/Logo_Restaurants/QR_Code_Coupon/images.png"
        },
        {
            productId: 5,
            name: "Banana Republic",
            city: "New York",
            url: "http://bananarepublic.com/",
            image: "http://images.military.com/media/mail/deals-and-discounts/bananarepublic.jpg",
            coupon: "http://bot-mediator.herokuapp.com/UWS/Logo_Restaurants/QR_Code_Coupon/images.png"
        },
        {
            productId: 6,
            name: "Old Navy",
            city: "Boston",
            url: "www.oldnavy.com",
            image: "http://res.cloudinary.com/goodsearch/image/upload/v1439940283/hi_resolution_merchant_logos/old-navy_coupons.jpg",
            coupon: "http://bot-mediator.herokuapp.com/UWS/Logo_Restaurants/QR_Code_Coupon/images.png"
        }

    ]
}



function processEventWithLuis(event){


    console.log('in processEventWithLuis');
    var sender = event.sender.id.toString();

    if (event.message && event.message.text) {
        var text = event.message.text;
        // Handle a text message from this sender

        if (!sessionIds.has(sender)) {
            sessionIds.set(sender, uuid.v1());
        }


        console.log('sending text to LUIS for processing',text);

        request({
            url: 'https://api.projectoxford.ai/luis/v1/application?id=29a815c5-3543-4823-8b38-7be8bd113fb0&subscription-key=b33535abc6f9432fba6fa1fd5ace75ed',
            qs: {q: text},
            method: 'GET'
        }, function (error, response, body) {
            if (error) {
                console.log('Error sending processing message: ', error);
            } else if (response.body.error) {
                console.log('Error: ', response.body.error);
            }

            if (callback) {
                callback();
            }

            console.log("got response from LUIS:" +JSON.stringify(response));

        });

    }
}

function processEventWithApiAi(event) {
    var sender = event.sender.id.toString();

    if (event.message && event.message.text) {
        var text = event.message.text;
        // Handle a text message from this sender

        if (!sessionIds.has(sender)) {
            sessionIds.set(sender, uuid.v1());
        }

        console.log("Text", text);

        let apiaiRequest = apiAiService.textRequest(text,
            {
                sessionId: sessionIds.get(sender)
            });

        apiaiRequest.on('response', (response) => {
            if (isDefined(response.result)) {
                let responseText = response.result.fulfillment.speech;
                let responseData = response.result.fulfillment.data;
                let action = response.result.action;
                let actionIncomplete = response.result.actionIncomplete;


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

                    async.eachSeries(splittedText, (textPart, callback) => {
                        sendFBMessage(sender, {text: textPart}, callback);
                    });
                }


                //when we have collected certain info then do some app specific processing
                if(action && !actionIncomplete){


                    switch(action){

                        case "getProductsByLocation":

                            sendFBProcessingMessage(sender,true);

                            //use the product and city to get list from our fake database
                            var city = response.result.parameters['geo-city-us'];
                            var productType = response.result.parameters['product'];

                            var products = [];

                            if(db[productType]){

                                _.each(db[productType], function(product){
                                    if(product.city == city){
                                        //collect
                                        products.push(product);
                                    }
                                });

                                sendFBProcessingMessage(sender,false);

                                sendFBProductList(sender,products);


                            }else{
                                sendFBMessage(sender, {text: "Could not find any results :(" });
                            }

                            console.log("found following matches for "+productType + " in " + city + " " +JSON.stringify(products));


                            break;

                        default:



                    }

                }



            }
        });

        apiaiRequest.on('error', (error) => console.error(error));
        apiaiRequest.end();
    }


    if(event.postback && event.postback.payload){

        let payload = JSON.parse(event.postback.payload);

        let productId = payload.productId;

        let fbAction = payload['fb_action'];


        if(fbAction == 'GET_COUPON'){

            //find coupon for that productId

            _.each(db.restaurant, function(restaurant){
                if(restaurant.productId == productId){
                    sendFBImage(sender, restaurant.coupon);
                }
            })

            _.each(db.clothing, function(clothingStore){
                if(clothingStore.productId == productId){
                    sendFBImage(sender, clothingStore.coupon);
                }
            })



        }



    }

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
            message: messageData
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


function sendFBProcessingMessage(sender, typingOnOrOff, callback){
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token: FB_PAGE_ACCESS_TOKEN},
        method: 'POST',
        json: {
            recipient: {id: sender},
            sender_action: (typingOnOrOff) ? "typing_on" : "typing_off"
        }
    }, function (error, response, body) {
        if (error) {
            console.log('Error sending processing message: ', error);
        } else if (response.body.error) {
            console.log('Error: ', response.body.error);
        }

        if (callback) {
            callback();
        }
    });
}


function sendFBImage(sender, imageUrl, callback){
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token: FB_PAGE_ACCESS_TOKEN},
        method: 'POST',
        json: {
            recipient: {id: sender},
            "message":{
                "attachment":{
                    "type":"image",
                    "payload":{
                        "url": imageUrl
                    }
                }
            }
        }
    }, function (error, response, body) {
        if (error) {
            console.log('Error sending image: ', error);
        } else if (response.body.error) {
            console.log('Error: ', response.body.error);
        }

        if (callback) {
            callback();
        }
    });
}

function sendFBProductList(sender,products, callback){

    let elements = [];

    _.each(products, function(product){


        var postbackPayload = {
            'productId' : product.productId,
            'fb_action': 'GET_COUPON'
        };

        elements.push( {
                "title":product.name,
                "image_url":product.image,
                "subtitle":"todo",
                "buttons":[
                    {
                        "type":"web_url",
                        "url": product.url,
                        "title":"View Website"
                    },
                    {
                        "type":"postback",
                        "title":"Get Coupon",
                        "payload": JSON.stringify(postbackPayload)
                    }
                ]
            }
        );

    });


    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token: FB_PAGE_ACCESS_TOKEN},
        method: 'POST',
        json: {
            recipient: {id: sender},
            "message":{
                "attachment":{
                    "type":"template",
                    "payload":{
                        "template_type":"generic",
                        "elements": elements
                    }
                }
            }
        }
    }, function (error, response, body) {
        if (error) {
            console.log('Error sending product list: ', error);
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

app.get('/fb-webhook/', function (req, res) {
    if (req.query['hub.verify_token'] == FB_VERIFY_TOKEN) {
        res.send(req.query['hub.challenge']);

        setTimeout(function () {
            doSubscribeRequest();
        }, 3000);
    } else {
        res.send('Error, wrong validation token');
    }
});

app.post('/fb-webhook/', function (req, res) {
    try {

        console.log('post data:\n' + JSON.stringify(JSON.parse(req.body)));
        console.log('test 1' );
        var data = JSONbig.parse(req.body);
        console.log('test 2' );

        var messaging_events = data.entry[0].messaging;
        console.log('test 3' );
        for (var i = 0; i < messaging_events.length; i++) {
            console.log('test 4' );
            var event = data.entry[0].messaging[i];

            /*if(agent == API_AI){
                console.log('process with api.ai');
                processEventWithApiAi(event);
            }else if(agent == MS_LUIS){*/
                console.log('process with luis');
                processEventWithLuis(event);
            /*}else{
                console.log('wtf');
            }*/

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

app.get('/skype-webhook/', function (req, res) {
    console.log('in skype webhook get');
});

app.post('/skype-webhook/', function (req, res) {
    try {
        console.log('in skype webhook post');
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