
// File: src/PointCloudWorker.js
// Ce module sera chargé en tant que Web Worker via new Worker(new URL(...), import.meta.url)

// self.onmessage = function(event) {
//   const { type, payload } = event.data;
//   if (type === 'processPointCloud') {
//         const obj = payload;
//         const coordsList = [];
//         const colorsList = [];
//         if (obj.pointcloudlist && obj.pointcloudlist.pointcloudsList) {
//             obj.pointcloudlist.pointcloudsList.forEach((pointCloud) => {
//                 if (pointCloud.pointsList) {
//                     pointCloud.pointsList.forEach((point) => {
//                         coordsList.push(point.x, point.y, point.z);
//                         colorsList.push(point.r, point.g, point.b);
//                     });
//                 }
//             });
//         }
//
//         // Envoie aussi la matrice de la pose au main thread
//         const coordsArray = new Float32Array(coordsList);
//         const colorsArray = new Float32Array(colorsList);
//         self.postMessage(
//             {
//                 coords: coordsArray,
//                 colors: colorsArray,
//                 //poseMatrix: lastPoseMatrix, // <-- ajout ici
//             },
//             [coordsArray.buffer, colorsArray.buffer]
//         );
//     }
//
// };

// File: src/PointCloudWorker.js
// Ce module sera chargé en tant que Web Worker via new Worker(new URL(...), import.meta.url)

// self.onmessage = function(event) {
//   const { type, payload } = event.data;
//   if (type === 'processPointCloud') {
//         console.log('🔧 Worker: Début traitement chunk');
//         
//         const obj = payload;
//         const coordsList = [];
//         const colorsList = [];
//         
//         if (obj.pointcloudlist && obj.pointcloudlist.pointcloudsList) {
//             console.log(`🔧 Worker: ${obj.pointcloudlist.pointcloudsList.length} pointcloud(s) à traiter`);
//             
//             obj.pointcloudlist.pointcloudsList.forEach((pointCloud) => {
//                 if (pointCloud.pointsList) {
//                     console.log(`🔧 Worker: Traitement de ${pointCloud.pointsList.length} points`);
//                     pointCloud.pointsList.forEach((point) => {
//                         coordsList.push(point.x, point.y, point.z);
//                         colorsList.push(point.r, point.g, point.b);
//                     });
//                 }
//             });
//         }
//
//         const coordsArray = new Float32Array(coordsList);
//         const colorsArray = new Float32Array(colorsList);
//         
//         console.log(`🔧 Worker: Envoi de ${coordsArray.length / 3} points au main thread`);
//         
//         self.postMessage(
//             {
//                 coords: coordsArray,
//                 colors: colorsArray,
//             },
//             [coordsArray.buffer, colorsArray.buffer]
//         );
//     }
// };


// File: src/PointCloudWorker.js
// Ce module sera chargé en tant que Web Worker via new Worker(new URL(...), import.meta.url)

self.onmessage = function(event) {
  const { type, payload, metadata } = event.data;
  if (type === 'processPointCloud') {
        console.log('🔧 Worker: Début traitement chunk');
        
        const obj = payload;
        const coordsList = [];
        const colorsList = [];
        
        if (obj.pointcloudlist && obj.pointcloudlist.pointcloudsList) {
            console.log(`🔧 Worker: ${obj.pointcloudlist.pointcloudsList.length} pointcloud(s) à traiter`);
            
            obj.pointcloudlist.pointcloudsList.forEach((pointCloud) => {
                if (pointCloud.pointsList) {
                    console.log(`🔧 Worker: Traitement de ${pointCloud.pointsList.length} points`);
                    pointCloud.pointsList.forEach((point) => {
                        coordsList.push(point.x, point.y, point.z);
                        colorsList.push(point.r, point.g, point.b);
                    });
                }
            });
        }

        const coordsArray = new Float32Array(coordsList);
        const colorsArray = new Float32Array(colorsList);
        
        console.log(`🔧 Worker: Envoi de ${coordsArray.length / 3} points au main thread`);
        
        self.postMessage(
            {
                coords: coordsArray,
                colors: colorsArray,
                metadata: metadata // Retourner les métadonnées pour la sauvegarde
            },
            [coordsArray.buffer, colorsArray.buffer]
        );
    }
};

