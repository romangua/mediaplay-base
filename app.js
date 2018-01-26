var express = require('express');
var fs = require('fs');
var download = require('download');
var url = require('url');
var CronJob = require('cron').CronJob;
var mongoose = require('mongoose');
var firebase = require('firebase');
var Video = require('./models/videos');
var logger = require('./utils/logger');

var _downloadingFile = false;
var _pathCaption = './';
var _pathImage = './';
var _pathVideo = './';

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
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    next();
});

// Conexion a la BD y a NodeJs
mongoose.Promise = global.Promise;
mongoose.connect('mongodb://localhost:27017/MediaPlay_BD', { useMongoClient: true })
    .then(() => {
        logger.info("Mongoo DB conectada correctamente");
        app.listen(3000, () => logger.info("Api REST running on http://localhost:3000"));

        //Se ejecuta cada 5min
        var jobUpdate = new CronJob({
            cronTime: '*/1 * * * *',
            onTick: function () {
                if (!_downloadingFile) {
                    _downloadingFile = true;
                    syncToCloud();
                }
            },
            start: true, // Inicia el proceso
            runOnInit: true // Le indica que se ejecute al inicializarse
        });
    })
    .catch((err) => {
        if (err) logger.error("Error al conectarse a la bd: " + err);
    });

// Permite obtener a los colectivos la lista de videos 
// que posee la base en su BD
app.get('/syncToBase', function (req, res, next) {
    Video.find({}, (err, videos) => {
        if (err) return res.status(500).send({ message: "Error al obtener los videos: " + err });

        res.status(200).send(videos);
    });
});

// Sincroniza con firebase
async function syncToCloud() {
    try {
        // Obtenemos el json de videos desde Firebase
        var response = await firebase.database().ref('/videos').once('value');
        var videosFirebase = [];
        response.forEach(function(doc) {
            videosFirebase.push(doc.val());
        });

        // Priorizamos eliminar videos de la BD
        // Recorro la lista de videos de la bd para ver si hay alguno que no este en la lista de videos de firebase
        await syncDelete(videosFirebase);

        // Sincronizamos los videos con firebase
        for(var i in videosFirebase) {
            var video = await Video.findOne({ id: videosFirebase[i].id }).exec();

            // Esta en la BD de la base
            if (video != null) {
                await syncUpdate(video.metadata.version, videosFirebase[i]);
            }
            // No esta en la BD de la base
            else {
                await syncInsert(videosFirebase[i]);
            }
        }
		_downloadingFile = false;
    }
    catch(err) {
        _downloadingFile = false;
        return logger.error("Se produjo un error inesperado: " + err);
    }
}

async function syncDelete(registrosFirebase) {
    // Obtenemos la lista de videos de la BD
    var registrosBd = await Video.find({}).exec();
    for (var i in registrosBd) {

        // Recorremos la lista de videos de firebase
        var keep = false;
        for (var x in registrosFirebase) {
            // Si el video esta en firebase hay que mantenerlo, sino eliminarlo
            if (registrosBd[i].id == registrosFirebase[x].id) {
                keep = true;
            }
        }

        // Si no esta en firebase lo eliminamos
        if (!keep) {
            
            logger.info("-------------------------");
            logger.info("Inicio de eliminacion del registro id: " + registrosBd[i].id);

            // Primero borramos de la bd el registro
            await Video.findOneAndRemove({ id: registrosBd[i].id }).exec();
            logger.info("El registro id " + registrosBd[i].id + " fue eliminado de la bd");

            // Borramos la imagen
            var imageDelete = registrosBd[i].image.url;
            imageDelete = imageDelete.substring(imageDelete.lastIndexOf("/") + 1, imageDelete.lenght);
            await deleteFile(_pathImage + imageDelete);

            // Borramos los subtitulos
            for (var x in registrosBd[i].caption.cap) {
                var captionDelete = registrosBd[i].caption.cap[x].url;
                if (captionDelete) {
                    captionDelete = captionDelete.substring(captionDelete.lastIndexOf("/") + 1, captionDelete.lenght);
                    await deleteFile(_pathCaption + captionDelete);
                }
            }

            // Borramos el video
            var videoDelete = registrosBd[i].video.url;
            videoDelete = videoDelete.substring(videoDelete.lastIndexOf("=") + 1, videoDelete.lenght);
            await deleteFile(_pathVideo + videoDelete);

            // Borramos la publicidad
            if(registrosBd[i].advertising) {
                // Borramos ads video
                for (var x in registrosBd[i].advertising.video) {
                    var adsVideo = registrosBd[i].advertising.video[x].url;
                    if (adsVideo) {
                        adsVideo = adsVideo.substring(adsVideo.lastIndexOf("/") + 1, adsVideo.lenght);
                        await deleteFile(_pathVideo + adsVideo);
                    }
                }

                // Borramos ads image
                for (var x in registrosBd[i].advertising.image) {
                    var adsImage = registrosBd[i].advertising.image[x].url;
                    if (adsImage) {
                        adsImage = adsImage.substring(adsImage.lastIndexOf("/") + 1, adsImage.lenght);
                        await deleteFile(_pathImage + adsImage);
                    }
                }
            }
        }
    }
}

async function deleteFile(path) {
    await fs.unlink(path, ()=>{});
    logger.info("Archivo eliminado: " + path);
}

async function syncInsert(registroFirebase) {
    logger.info("-------------------------");
    logger.info("Inicio de descarga del registro id: " + registroFirebase.id);

    // Primero descargamos el video 
    await download(registroFirebase.video.urlCloud, _pathVideo)
    logger.info("Finalizo la descarga del video id: " + registroFirebase.id)

    // Descargamos la imagen
    await download(registroFirebase.image.urlCloud, _pathImage)
    logger.info("Finalizo la descarga de la imagen id: " + registroFirebase.id)

    // Descargamos la publicidad
    if(registroFirebase.advertising) {
        // Videos
        if(registroFirebase.advertising.video) {
            for(var i in registroFirebase.advertising.video) {
                await download(registroFirebase.advertising.video[i].urlCloud, _pathVideo)
                logger.info("Finalizo la descarga del ads video id: " + registroFirebase.id + " index: " + i)
            }
        }
        // Imagenes
        if(registroFirebase.advertising.image) {
            for(var i in registroFirebase.advertising.image) {
                await download(registroFirebase.advertising.image[i].urlCloud, _pathImage)
                logger.info("Finalizo la descarga del ads image id: " + registroFirebase.id + " index: " + i)
            }
        }
    }

    // Descargamos los subtitulos
    if(registroFirebase.caption) {
        for(var i in registroFirebase.caption.cap) {
            await download(registroFirebase.caption.cap[i].urlCloud, _pathCaption)
            logger.info("Finalizo la descarga del subtitulo id: " + registroFirebase.id + " index: " + i)
        }
    }

    // Insertamos el registro en la bd
    var video = parserToInsert(registroFirebase);
    await video.save();
    logger.info("Finalizo la descarga y se inserto el video id: " + video.id);
}

async function syncUpdate(registroBdVersion, registroFirebase) {
    logger.info("-------------------------");
    logger.info("Inicio de actualizacion del registro id: " + registroFirebase.id);

    if (registroBdVersion != registroFirebase.metadata.version) {

        // Parseamos el objecto para actualizarlo
        var videoParsed = parserToUpdate(registroFirebase);

        //logger.info(JSON.stringify(videoParsed))
        await Video.update({ id: registroFirebase.id }, videoParsed).exec()
        logger.info("Finalizo la actualizacion del registro id " + registroFirebase.id + " en la bd");
    }
    else {
        logger.info("No fue necesaria la actualizacion del registro id " + registroFirebase.id + " en la bd");  
    }
}

function parserToInsert(value) {
    var video = new Video();

    video.id = value.id;
    video.description = value.description;
    video.year = value.year;
    video.staring = value.staring;
    video.director = value.director;
    video.video = {
        url: value.video.url,
        urlBase: value.video.urlBase
    },
    video.clasification = value.clasification;
    video.name = value.name;
    video.duration = value.duration;
    video.type = value.type;
    video.image = {
        url: value.image.url,
        urlBase: value.image.urlBase
    },
    video.metadata = {
        version: value.metadata.version
    };

    if(value.caption) {
        for (var i in value.caption.cap) {
            video.caption.cap.push({
                label: value.caption.cap[i].label,
                url: value.caption.cap[i].url,
                urlBase: value.caption.cap[i].urlBase
            });
        }
        video.caption.default = value.caption.default;
    }
   
    if(value.advertising) {
        if(value.advertising.video) {
            for(var i in value.advertising.video) {
                video.advertising.video.push({
                    start: value.advertising.video[i].start,
                    hold: value.advertising.video[i].hold,
                    url: value.advertising.video[i].url,
                    urlBase: value.advertising.video[i].urlBase
                });
            }
        }

        if(value.advertising.image) {
            for(var i in value.advertising.image) {
                video.advertising.image.push({
                    start: value.advertising.image[i].start,
                    end: value.advertising.image[i].end,
                    hold: value.advertising.image[i].hold,
                    url: value.advertising.image[i].url,
                    urlBase: value.advertising.image[i].urlBase
                });
            }
        }
    }
    return video;
}

function parserToUpdate(value) {
    var video = {
        "id": value.id,
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

// Permite obtener la lista de videos desde la BD
app.get('/test', function (req, res, next) {
    _downloadingFile = true;
    res.status(200).send("Empezo la sincronizacion");
    syncToCloud();
});

app.get('/delete', function (req, res, next) {
    Video.findOne({ id: 2 }, (err, video) => {
        if (err) return res.status(500).send({ message: "Error al eliminar el video: " + err });

        if (video != null) {
            video.remove(err => {
                if (err) return res.status(500).send({ message: "Error al eliminar el video: " + err });

                res.status(200).send({ message: "El video fue eliminado" });
            })
        }
    });
});

app.get('/deleteAll', function (req, res, next) {
    Video.find({}, (err, video) => {
        if (err) return res.status(500).send({ message: "Error al eliminar el video: " + err });

        for (var i in video) {
            if (video[i] != null) {
                video[i].remove(err => {
                    if (err) return res.status(500).send({ message: "Error al eliminar el video: " + err });
                });
            }
        }
        res.status(200).send({ message: "Se eliminaron videos" });
    });
});

