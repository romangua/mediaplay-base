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
    caption: [
		{
		  label: String,
		  languaje: String,
      src: String,
      urlBase: String,
		  kind: String,
		  default: String,
		}
	],	
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