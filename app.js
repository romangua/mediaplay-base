var express = require('express');
var fs = require("fs");
var path = require("path");
var url = require('url');
var CronJob = require('cron').CronJob;
var piWifi = require('pi-wifi');
var exec = require('child_process').exec, child;
var mongoose = require('mongoose');
var firebase = require('firebase');
var Video = require('./models/videos');

var config = {
    apiKey: "AIzaSyBohaAcF-MQXR8gdSHV2iZWwI5NdYpFRio",
    authDomain: "mediaplay-44a81.firebaseapp.com",
    databaseURL: "https://mediaplay-44a81.firebaseio.com",
    projectId: "mediaplay-44a81",
    storageBucket: "mediaplay-44a81.appspot.com",
    messagingSenderId: "1009870121712"
  };
  firebase.initializeApp(config);

var app = express();
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
      next();
});

//app.use(express.static('/media/pi/UUI/public'));
app.use(express.static('./'));

mongoose.Promise = global.Promise;

mongoose.connect('mongodb://localhost:27017/MediaPlay_BD', {useMongoClient:true})
    .then(() => {
        console.log("Mongoo DB conectada correctamente");
        app.listen(3000, () => console.log("Api REST running on http://localhost:3000"));
    })
    .catch((err) => {
        if(err) throw err;
    });

//Se ejecuta cada 5min
var jobUpdate = new CronJob({
   cronTime: '* 15 * * * *',
   onTick: function() {
	 var ssidBase = "Vault Internal";
     var passwordBase = "10042017";
	 /*
	 // Si ya esta conectado a la red no hace nada  
	 piWifi.check(ssidBase, function(err, result) {		       
		if(result.connected) {
		  return console.log('2 piWifi.check: Ya se encuentra conectado a ' + ssidBase);		 
		}
		else if(!result.connected) {
			
		  // Busca las redes wifi disponibles
		  piWifi.scan(function(err, network) {
		   if(err) {
			 return console.log("4 piWifi.scan: " + err.message);
		   }
		   if(network == null && network.lenght == 0) {
			 return;
		   }
		   
		   // Si encuentra la red se conecta
		   for(i in network) {       
			  if(network[i].ssid == ssidBase) {
				
				// Conecto a la red 
				piWifi.connect(ssidBase, passwordBase,  function(err) {
				  
				  doWait(15);
				  
				  piWifi.check(ssidBase, function(err, result) {
				    if(result.connected) {
					  console.log('8 piWifi.check: Conectado a ' + ssidBase);
					  
					  // Este comando se ejecuta para borrar el gateway del eth0 y que funcione internet con wlan0
					  child = exec('sudo route del default gw 192.168.0.254 eth0');
					  
					  doWait(30);
				  
					  // Terminado el trabajo me desconecto de la wifi
					  piWifi.disconnect(function(err) {
						if(err) {
						  return console.log("9 piWifi.disconnect: " + err.message);
						}
						return console.log("10 piWifi.disconnect: Desconeccion de " + ssidBase);
					  });
					}
				  });                         
				});
			  }
		    }
		 });		 
		} 
	 });  */  
 },
 onComplete: function() {
   console.log("Job end");
 },
 start: true, // Inicia el proceso
 runOnInit: true // Le indica que se ejecute al inicializarse
}); 

// Frena la ejecucion los segundos indicados
function doWait(seconds) {
  var waitTill = new Date(new Date().getTime() + seconds * 1000);
  while(waitTill > new Date()){}
}

app.get('/getResources', function(req,res, next){
    Video.find({}, (err, videos) => {
        if(err) return res.status(500).send({message:"Error al obtener todos los videos: " + err});

        res.status(200).send({videos});
    });
});

//Test BD
app.get('/insert', function(req,res, next){
    var video = new Video();
    video.id = 1;
    video.description = "test";

    video.save((err, stored) => {
        if(err){
            res.send("error insertando en bd: " + err);
        }
        else {
            res.send("insertado: " + stored);
        }
    });
});

app.get('/delete', function(req,res, next){
    Video.findOne({ id: 1 }, (err, video) => {
        if(err) return res.status(500).send({message:"Error al eliminar el video: " + err});

        video.remove(err => {
            if(err) return res.status(500).send({message: "Error al eliminar el video: " + err});
            
            res.status(200).send({message: "El video fue eliminado"});
        })
    });
});

app.get('/update', function(req,res, next){
    Video.findOne({ id: 1 }, (err, video) => {
        if(err) return res.status(500).send({message:"Error al actualizar el video: " + err});

        video.update({ name: "sadasd"}, err => {
            if(err) return res.status(500).send({message: "Error al actualizar el video: " + err});
            
            res.status(200).send({message: "El video fue actualizado"});
        })
    });
});
