(function(window) {
  'use strict';

  function debug(str) {
    console.log('DeviceStorageService -*-:' + str);
  }

  // Ok, this kinda sucks because most APIs (and settings is one of them) cannot
  // be accessed from outside the main thread. So basically everything has to go
  // down to the SW thread, then back up here for processing, then back down to
  // be sent to the client. Yay us!
  var _deviceStorages = {};

  var processSWRequest = function(channel, evt) {
    // We can get:
    // * methodName
    // * onchange
    // * getDeviceStorage
    // All the operations have a requestId, and the lock operations also include
    // a deviceStorage id.
    var remotePortId = evt.data.remotePortId;
    var request = evt.data.remoteData;
    var requestOp = request.data;

    function observerTemplate(evt) {
      channel.postMessage({
        remotePortId: remotePortId,
        data: {
          id: request.id,
          data: {
            path: evt.path,
            reason: evt.reason
          }
        }
      });
    }

    if (requestOp.operation === 'getDeviceStorage') {
      var deviceStorages = navigator.getDeviceStorages(requestOp.params);
      deviceStorages.forEach(ds => {
        if (ds.storageName === requestOp.storageName) {
          _deviceStorages[request.id] = ds;
          return;
        }
      });
      // Let's assume this works always...
      channel.postMessage({remotePortId: remotePortId, data: {id: request.id}});
    } else if (requestOp.operation === 'onchange') {
      _deviceStorages[requestOp.deviceStorageId].onchange = observerTemplate;
    } else if (requestOp.operation === 'enumerate' ||
      requestOp.operation === 'enumerateEditable') {
        var cursor =
          _deviceStorages[requestOp.deviceStorageId][requestOp.operation].
          apply(_deviceStorages[requestOp.deviceStorageId], requestOp.params);
        var files = [];

        cursor.onsuccess = () => {
          var file = cursor.result;
          // 'cursor.done' flag should be activated when the last file is
          // reached. However, it seems that the flag is only is enabled in 
          // the next iteration so we've always got an undefined file
          if (typeof file !== 'undefined') {
            files.push(cursor.result);
          }

          if (!cursor.done) {
            cursor.continue();
          } else {
            // Send message
            channel.postMessage({
              remotePortId: remotePortId,
              data: { id : request.id, result: files}}
            );
          }
        };

        cursor.onerror = () => {
          channel.postMessage({
            remotePortId: remotePortId,
            data: { id : request.id, error: cursor.error}}
          );
        };
    } else {
      var method = 'call';
      if (requestOp.params && typeof requestOp.params === 'object') {
        method = 'apply';
      }
      _deviceStorages[requestOp.deviceStorageId][requestOp.operation]
        [method](_deviceStorages[requestOp.deviceStorageId], requestOp.params).
          then(result => {
            channel.postMessage({
              remotePortId: remotePortId,
              data: { id : request.id, result: result}}
            );
      }).catch(error => {
        channel.postMessage({
          remotePortId: remotePortId,
          data: { id : request.id, result: error}}
        );
      });
    }
  };


  // Testing purpose only!!!!
  window.addEventListener('load', function () {
    if (window.ServiceHelper) {
      debug('APP serviceWorker in navigator');
      window.ServiceHelper.register(processSWRequest);
    } else {
      debug('APP navigator does not have ServiceWorker');
      return;
    }
  });

})(window);
