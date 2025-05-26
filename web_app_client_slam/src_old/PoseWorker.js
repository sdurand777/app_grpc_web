self.onmessage = function(event) {
    const { type, payload } = event.data;

    if (type === 'processPoseList') {
        // payload est un PoseList reçu du service
        let lastPoseMatrix = null;

        if (payload.posesList && payload.posesList.length > 0) {
            const lastPose = payload.posesList[payload.posesList.length - 1];

            if (lastPose.matrixList && lastPose.matrixList.length === 16) {
                lastPoseMatrix = lastPose.matrixList;
            } else if (lastPose.matrix && lastPose.matrix.length === 16) {
                lastPoseMatrix = lastPose.matrix;
            } else {
                console.log("Pose brute (structure inattendue):", lastPose);
            }
        }

        self.postMessage({
            poseMatrix: lastPoseMatrix
        });
    }
};
