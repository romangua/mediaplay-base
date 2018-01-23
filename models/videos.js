'use strict'

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

const VideoSchema = Schema ({
    id: Number,
    description:  String,
    year: Number,
    staring: String,
    director: String,
    video: {
      url: String,
      urlBase: String
    },
    caption: {
      cap: [{
          label: String,
          url: String,
          urlBase: String
        }],
      default: Number
    },	
    advertising: {
      video : [{
        start: String,
        hold: Number,
        url: String,
        urlBase: String
      }],
      image: [{
        start: String,
        end: String,
        hold: Number,
        url: String,
        urlBase: String
      }]
    } ,
    clasification: String,
    name: String,
    duration: Number,
    type: String,
    image: {
      url: String,
      urlBase: String
    },
    metadata: {
      version: Number
    }
});

module.exports = mongoose.model('Video', VideoSchema);