var express = require('express');
var fs = require("fs");
var download = require('download');
var path = require("path");
var url = require('url');
var CronJob = require('cron').CronJob;
var piWifi = require('pi-wifi');
var exec = require('child_process').exec, child;
var mongoose = require('mongoose');
var firebase = require('firebase');
var Video = require('./models/videos');

var _downloadingFile = false;
var _pathCaption = './';
var _pathImage = './';
var _pathVideo = './';
var _indexSync = 0;

// Configuracion de Firebase
var config = {
    apiKey: "AIzaSyBohaAcF-MQXR8gdSHV2iZWwI5NdYpFRio",
    authDomain: "mediaplay-44a81.firebaseapp.com",
    databaseURL: "https://mediaplay-44a81.firebaseio.com",
    projectId: "mediaplay-44a81",
    storageBucket: "mediaplay-44a81.appspot.com",
    messagingSenderId: "1009870121712"
  };
  firebase.initializeApp(config);

// Inicializacion de Express
var app = express();
app.use(express.static('./'));
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
      next();
});

// Conexion a la BD y a NodeJs
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

// Permite obtener a los colectivos la lista de videos 
// que posee la base en su BD
app.get('/syncToBase', function(req,res, next){
    Video.find({}, (err, videos) => {
        if(err) return res.status(500).send({message:"Error al obtener los videos: " + err});

        res.status(200).send(videos);
    });
});

// Permite obtener la lista de videos desde la BD
app.get('/test', function(req,res, next) {
    if(!_downloadingFile) {
        _downloadingFile = true;
        syncToCloud();
        res.status(200).send("Empezo la sincronizacion");
    }
});

function syncToCloud() {
    try {
        // Obtenemos el json de videos desde Firebase
        firebase.database().ref('/videos').once('value')
        .then(function(snapshot) {
            var videosFirebase = snapshot.val();
            var numberToSync = getLenghtArray(videosFirebase);
            
            // Obtenemos la lista de videos de la BD
            Video.find({}, (err, videos) => {
                if(err) throw("Error al obtener todos los videos syncToCloud: " + err);
        
                // Priorizamos eliminar videos de la BD
                // Recorro la lista de videos de la bd para ver si hay alguno que no este en 
                // la lista de videos de firebase
                syncDelete(videos, videosFirebase);

                // Emparejamos la BD con respecto a firebase
                // Primero vemos si quedan elementos por sincronizar
                if(_indexSync < numberToSync) {
                    // Buscamos el video por id en la bd
                    Video.findOne({ id: videosFirebase[_indexSync].id }, (err, video) => {
                        if(err) throw("Error al obtener el registro de la bd: " + err);

                        // Esta en la BD de la base
                        if(video != null) {
                            syncUpdate(video.metadata.version, videosFirebase[_indexSync]);
                        }
                        // No esta en la BD de la base
                        else {
                            syncInsert(videosFirebase[_indexSync]);
                        }
                    });
                }
                else {
                    _indexSync = 0;
                    _downloadingFile = false;
                }
            });
        },
        function(err) {
            throw("Error en consulta de datos a firebase: " + err);
        });
    }
    catch(err) {
        console.error("Ocurrio un error inesperado: " + err);
        _downloadingFile = false;
    }
}

function syncDelete(registrosBd, registrosFirebase) {
    for(var i in registrosBd) {

        // Recorremos la lista de videos de firebase
        var keep = false;
        for(var x in registrosFirebase) {
            // Si el video esta en firebase hay que mantenerlo, sino eliminarlo
            if(registrosBd[i].id == registrosFirebase[x].id) {
                keep = true;
            }
        }

        // Si no esta en firebase lo eliminamos
        if(!keep) {
            // Primero borramos de la bd el registro
            Video.findOne({ id: registrosBd[i].id }, (err, video) => {
                if(err) throw("Error al buscar el video para eliminarlo: " + err);
        
                if(video != null) {
                    video.remove(err => {
                        if(err) throw("Error al eliminar el registro id " + registrosBd[i].id  + " de la bd: " + err);
                
                        console.log("El registro id " + registrosBd[i].id  + " fue eliminado de la bd");
                    })
                }
            });

            // Borramos la imagen
            var imageDelete = registrosBd[i].image;
            imageDelete = imageDelete.substring(imageDelete.lastIndexOf("/") + 1, imageDelete.lenght);
            deleteFile(_pathImage + imageDelete);

            // Borramos los subtitulos
            for(var x in registrosBd[i].caption) {
                var captionDelete = registrosBd[i].caption[x].src;
                if(captionDelete) {
                    captionDelete = captionDelete.substring(captionDelete.lastIndexOf("/") + 1, captionDelete.lenght);
                    deleteFile(_pathCaption + captionDelete);
                }
            }

            // Borramos el video
            var videoDelete = registrosBd[i].url;
            videoDelete = videoDelete.substring(videoDelete.lastIndexOf("=") + 1, videoDelete.lenght);
            deleteFile(_pathVideo + videoDelete);
        }
    }
}

function deleteFile(path) {
    fs.unlink(path, function(err) {
        if (err) {
            return console.error("Error al eliminar el archivo: " + path + "-- Error: " + err);
        }
        console.log("Archivo eliminado: " + path);
     });
}

function syncInsert(registroFirebase) {

    console.log("-------------------------");
    console.log("Inicio de descarga del registro id: " + registroFirebase.id);

    // Primero descargamos el video 
    download(registroFirebase.video.urlCloud, _pathVideo)
        .then(() => {
            console.log("Finalizo la descarga del video id: " + registroFirebase.id)

            // Descargamos la imagen
            download(registroFirebase.image.urlCloud, _pathImage)
            .then(() => {
                console.log("Finalizo la descarga de la imagen id: " + registroFirebase.id)

                // Descargamos los subtitulos. TODO-Se puede descargar hasta 2 por ahora.
                var lenght = getLenghtArray(registroFirebase.caption);
                if(lenght > 0)
                {
                    var index = 0;
                    download(registroFirebase.caption[index].urlCloud, _pathCaption)
                    .then(() => {
                        console.log("Finalizo la descarga del subtitulo id: " + registroFirebase.id + " index: " + index);
                        
                        index++;
                        if(index == lenght) {
                            insertInBD(registroFirebase);
                        }
                        else {
                            download(registroFirebase.caption[index].urlCloud, _pathCaption)
                            .then(() => {
                                console.log("Finalizo la descarga del subtitulo id: " + registroFirebase.id + " index: " + index);
                                
                                insertInBD(registroFirebase);
                            })
                            .catch((err) => {
                                if(err) throw err;
                            });
                        }
                    })
                    .catch((err) => {
                        if(err) throw err;
                    });
                } else {
                    insertInBD(registroFirebase);
                }
            })
            .catch((err) => {
                if(err) throw err;
            });
        })
        .catch((err) => {
            throw("Error en la descarga: " + err);
        });
}

function insertInBD(value) {
    // Parseamos el objeto y registramos en la bd
    var video = parserToInsert(value);
    video.save((err, stored) => {
        if(err)  throw err;

        console.log("Finalizo la descarga y se inserto el video id: " + video.id);
        _indexSync++;
        syncToCloud();
    });
}

function syncUpdate(registroBdVersion, registroFirebase) {
    console.log("-------------------------");
    console.log("Inicio de actualizacion del registro id: " + registroFirebase.id);

    if(registroBdVersion != registroFirebase.metadata.version) {

        // Parseamos el objecto para actualizarlo
        var videoParsed = parserToUpdate(registroFirebase);

        //console.log(JSON.stringify(videoParsed))
        Video.update({ id: registroFirebase.id }, videoParsed, err => {
            if(err) throw("Error actualizando el registro id " + registroFirebase.id + " en la bd: " + err);

            console.log("Finalizo la actualizacion del registro id " + registroFirebase.id + " en la bd");
            _indexSync++;
            syncToCloud();
        });
    }
    else {
        console.log("No fue necesaria la actualizacion del registro id " + registroFirebase.id + " en la bd");
        _indexSync++;
        syncToCloud();
    }
}

function parserToInsert(value) {
    var video = new Video();

    video.id =  value.id;
    video.description = value.description;
    video.year = value.year;
    video.staring = value.staring;
    video.director = value.director;
    video.url = value.video.url;	
    video.clasification = value.clasification;
    video.name = value.name;
    video.duration = value.duration;
    video.type = value.type;
    video.image = value.image.url;
    video.metadata = { 
            version: value.metadata.version 
    };

    for (var i in value.caption) {
        video.caption.push({
            label: value.caption[i].label,
            languaje: value.caption[i].languaje,
            src: value.caption[i].src,
            kind: value.caption[i].kind,
            default: value.caption[i].default 
        });
    }

    return video;
}

function parserToUpdate(value) {
    var video = {
        "id":  value.id,
        "description": value.description,
        "year": value.year,
        "staring": value.staring,
        "director": value.director,
        "clasification": value.clasification,
        "name": value.name,
        "duration": value.duration,
        "type": value.type,
        "metadata": {
            "version": value.metadata.version
        }
    }

    return video;
}

// Funcion para contar el numero de objetos dentro de un array
function getLenghtArray(value) {
    var count = 0;
    for(var i in value) {
        count++;
    }
    return count;
}

app.get('/delete', function(req,res, next){
    Video.findOne({ id: 2 }, (err, video) => {
        if(err) return res.status(500).send({message:"Error al eliminar el video: " + err});

        if(video != null) {
            video.remove(err => {
                if(err) return res.status(500).send({message: "Error al eliminar el video: " + err});
                
                res.status(200).send({message: "El video fue eliminado"});
            })
        }
    });
});

app.get('/deleteAll', function(req,res, next){
    Video.find({}, (err, video) => {
        if(err) return res.status(500).send({message:"Error al eliminar el video: " + err});

        for(var i in video) {
            if(video[i] != null) {
                video[i].remove(err => {
                    if(err) return res.status(500).send({message: "Error al eliminar el video: " + err});
                })
            }
        }
        res.status(200).send({message: "Se eliminaron " + getLenghtArray(video) + " videos"});
    });
});

