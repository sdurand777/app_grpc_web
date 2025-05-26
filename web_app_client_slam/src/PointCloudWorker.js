
// File: src/PointCloudWorker.js
// Ce module sera chargé en tant que Web Worker via new Worker(new URL(...), import.meta.url)

self.onmessage = function(event) {
  const { type, payload } = event.data;
  if (type === 'processPointCloud') {
        const obj = payload;
        const coordsList = [];
        const colorsList = [];
        if (obj.pointcloudlist && obj.pointcloudlist.pointcloudsList) {
            obj.pointcloudlist.pointcloudsList.forEach((pointCloud) => {
                if (pointCloud.pointsList) {
                    pointCloud.pointsList.forEach((point) => {
                        coordsList.push(point.x, point.y, point.z);
                        colorsList.push(point.r, point.g, point.b);
                    });
                }
            });
        }

        // // === PREPARE LA POSE À ENVOYER ===
        // let lastPoseMatrix = null;
        // if (obj.poselist && obj.poselist.posesList && obj.poselist.posesList.length > 0) {
        //     const lastPose = obj.poselist.posesList[obj.poselist.posesList.length - 1];
        //     // Compatibilité protobufjs/proto
        //     if (lastPose.matrixList && lastPose.matrixList.length === 16) {
        //         lastPoseMatrix = lastPose.matrixList;
        //     } else if (lastPose.matrix && lastPose.matrix.length === 16) {
        //         lastPoseMatrix = lastPose.matrix;
        //     } else {
        //         // Log structure brute pour debug
        //         console.log("Pose brute (structure inattendue):", lastPose);
        //     }
        // }

        // juste avant self.postMessage
        //console.log("Envoi du worker, lastPoseMatrix:", lastPoseMatrix);

        // Envoie aussi la matrice de la pose au main thread
        const coordsArray = new Float32Array(coordsList);
        const colorsArray = new Float32Array(colorsList);
        self.postMessage(
            {
                coords: coordsArray,
                colors: colorsArray,
                //poseMatrix: lastPoseMatrix, // <-- ajout ici
            },
            [coordsArray.buffer, colorsArray.buffer]
        );
    }

};
