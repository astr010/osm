var fs = require('fs');
var http = require('http');
var exec = require('child_process').exec;
var urlHelper = require('url');
var gui = require('nw.gui');

var googleImages = require('google-images');
var exif = require('exif2');
var request = require('request');
var md5 = require('MD5');
var shredfile = require('shredfile')({});
var csv = require('csv-to-json');
var fdialogs = require('node-webkit-fdialogs');
var validator = require('validator');

var packageJsonFile = fs.readFileSync('package.json');
packageJson = JSON.parse(packageJsonFile);
useragent = packageJson['user-agent'];

// Mouse positions; see readMouseMove().
var x;
var y;

/**
 * Searches Google for images and appends the results to the page.
 * @param string query - The query to search for.
 */
function imageSearch(query) {
  var resultsCount = 0;
  var imagesDiv = document.getElementById('images');
  var endOfResults = document.getElementById('eor');
  var eorBreak = document.getElementById('eor-break');

  // The deprecated Google Images API only allows us to recieve a maximum
  // of 60 results.
  for (var i = 0; i < 57; i = i + 4) {
    // NOTE: Eventually this should be refactored, but I'm not overly
    // concerned about it at this time.

    /* jshint loopfunc: true */
    googleImages.search(query, { page: i, proxy: getSetting('proxy'), callback: function(err, images) {
      var resultsDiv = document.getElementById('results');

      if (err) {
        throwApplicationError('<p><code>ajax.googleapis.com</code> returned an error.</p><code>' + err + '</code>');
      }

      if (images[0]) {
        results.className = 'page-header';

        // Until we have some results, just show 0. Better than nothing, right?
        if (resultsCount === 0) {
          results.innerHTML = '<h3>0 Results</h3>';
        }
        images.forEach(function(image) {
          // NOTE: This is a little hack I implemented to replace imgur
          // thumbnails with the full image.
          if (image.url.substring(0, 19) === 'http://i.imgur.com/') {
            image.url = image.url.replace('b.jpg', '.jpg');
          }

          var options = { url: safeDecodeURIComponent(image.url),
                          proxy: getSetting('proxy'),
                          headers: { 'User-Agent': useragent } };

          resultsCount++;
          var file = fs.createWriteStream('./tmp/' + md5(image.url));
          var req = request(options);
          req.pipe(file);

          req.on('error', function(err) {
            // If we have an error, log it to the console.
            console.log('Web Request Error: ' + err);
          });

          req.on('end', function() {
            exif('./tmp/' + md5(image.url), function(err, obj) {
              var exifData = '';
              if (err === null) {
                for (var key in obj) {
                  if (obj.hasOwnProperty(key) &&
                      key !== 'exiftool version number' &&
                      key !== 'file name' &&
                      key !== 'directory' &&
                      key !== 'file inode change date time' &&
                      key !== 'file modification date time' &&
                      key !== 'file access date time' &&
                      key !== 'file permissions') {
                      exifData += ucwords(key) + ': ' + obj[key] + '<br>';
                  }
                }
              } else {
                exifData = '<p>Extracting EXIF data failed. Please make sure exiftool is installed and available in PATH.</p><code>' + err + '</code>';
              }
              shredfile.shred('./tmp/' + md5(image.url), function(err, file) {

              });
              results.innerHTML = '<h3>' + resultsCount + ' Results</h3>';

              // If we don't have a proxy setup there's no point in trying to
              // proxy the image.
              var src = proxifyUrl(image.url);
              if (getSetting('proxy') === '') {
                src = image.url;
              }

              // Let's pretend I never wrote this...
              /* jshint maxlen: false */
              imagesDiv.innerHTML += '<div class="thumbnail"><img class="thumbnail-image" id="' + md5(image.url) + '" src="' + src + '" title="' + getFileName(image.url) + ' at ' + getDomain(image.url) + '" onclick="showExifData(\'' + image.url + '\', \'' + window.btoa(unescape(encodeURIComponent(exifData))) + '\')" oncontextmenu="showContextMenu(\'' + image.url + '\', \'' + image.from + '\', \'' + window.btoa(unescape(encodeURIComponent(exifData))) + '\')"><br><br></div>';
              eorBreak.className = '';
              endOfResults.className = 'lead text-center text-muted';
            });
          });
        });
      } else {
        eorBreak.className = 'hidden';
        endOfResults.className = 'lead text-center text-muted hidden';
        results.className = 'page-header';
        results.innerHTML = '<h3>No images found.</h3>';
        return false;
      }
    }});
  }
}

// Stolen! Credits go to this chap: http://stackoverflow.com/users/1219011/twist
// Original: http://stackoverflow.com/a/11840120
// Modified to remove non-webkit CSS rules.
function getRotationDegrees(obj) {
  var angle;
  var matrix = obj.css('-webkit-transform') ||
  obj.css('transform');
  if (matrix !== 'none') {
    var values = matrix.split('(')[1].split(')')[0].split(',');
    var a = values[0];
    var b = values[1];
    angle = Math.round(Math.atan2(b, a) * (180/Math.PI));
  } else {
    angle = 0;
  }
  return (angle < 0) ? angle +=360 : angle;
}

/**
 * Shows a modal containing the EXIF data of an image.
 * @param string url - The URL where the image is located.
 * @param string data - A base64 encoded string containing the EXIF data.
 */
function showExifData(url, data) {
  var exifData = document.getElementById('exif-data');
  var exifTitle = document.getElementById('exif-title');

  exifTitle.innerHTML = getFileName(url);
  exifData.innerHTML = window.atob(data);
  $('#exif-data-modal').modal('show');
}

/**
 * Shows a context menu when right clicking on an image.
 * @param string url - The URL where the image is located.
 * @param string data - The URL of the page it came from.
 * @param string exifData - A base64 encoded string containing the EXIF data.
 */
function showContextMenu(url, from, exifData) {
  // TODO: Reduce the amount of statements. Yeah, this is a pile of fuck.
  /* jshint maxstatements:25 */
  var menu = new gui.Menu();
  var clipboard = gui.Clipboard.get();

  var flipImageItem = new gui.MenuItem(
    { label: 'Toggle Flip Image',
      icon: 'src/res/menuitem/flip.png',
      click: function() {
        var image = $('img[id="' + md5(url) + '"]');
        if (image.hasClass('flipped')) {
          image.removeClass('flipped');
        } else {
          image.addClass('flipped');
        }
      }
    });

  var searchOnTinEyeItem = new gui.MenuItem(
    { label: 'Search on TinEye',
      icon: 'src/res/menuitem/tineye.png',
      click: function() {
        gui.Shell.openExternal('http://www.tineye.com/search?url=' + url);
      }
    });

  var searchOnGoogleItem = new gui.MenuItem(
    { label: 'Search on Google',
      icon: 'src/res/menuitem/google.png',
      click: function() {
        gui.Shell.openExternal('http://www.google.com/searchbyimage?image_url=' + url);
      }
    });

  // TODO: Shred images.
  var genderAgeItem = new gui.MenuItem(
    { label: 'Age/Gender (Experimental)',
      icon: 'src/res/menuitem/openbr.png',
      click: function() {
        var file = fs.createWriteStream('./tmp/br/' + md5(url) + '.image');

        var options = { url: safeDecodeURIComponent(url),
                        proxy: getSetting('proxy'),
                        headers: { 'User-Agent': useragent } };

        var req = request(options);
        req.pipe(file);

        req.on('end', function() {
          isBinaryInstalled('br', function(result) {
            if (result === false) {
              throwApplicationError('OpenBR could not be found in PATH. Please make sure OpenBR is installed.');
            } else {
              exec('br -algorithm GenderEstimation -enroll ' + process.cwd() +
                   '/tmp/br/' + md5(url) + '.image ' + process.cwd() +
                   '/tmp/br/gender_' + md5(url) + '.csv', function(err, result) {
                if (err) {
                  throwApplicationError('<p>OpenBR is installed, but there was an error while executing it.</p><code>' + err + '</code>');
                }
                var genderResult = csv.parse('./tmp/br/gender_' + md5(url) +
                                             '.csv');

                var gender = genderResult[0].Gender;
                if (typeof(gender) === 'undefined') {
                  gender = 'Unknown';
                }
                var genderSpan = document.getElementById('gender');
                genderSpan.innerHTML = gender;
              });

              exec('br -algorithm AgeEstimation -enroll ' + process.cwd() +
                   '/tmp/br/' + md5(url) + '.image ' + process.cwd() +
                   '/tmp/br/age_' + md5(url) + '.csv', function(err, result) {
                if (err) {
                  throwApplicationError('<p>OpenBR is installed, but there was an error while executing it.</p><code>' + err + '</code>');
                  return;
                }
                var ageResult = csv.parse('./tmp/br/age_' + md5(url) + '.csv');

                var age = ageResult[0].Age;
                var ageSpan = document.getElementById('age');
                if (typeof(age) === 'undefined') {
                  ageSpan.innerHTML = 'Unknown';
                } else {
                  ageSpan.innerHTML = Math.round(age);
                }
              });
              $('#age-gender-modal').modal('show');
            }
          });
        });
      }
    });

  var viewFullImageItem = new gui.MenuItem(
    { label: 'View Full Image',
      icon: 'src/res/menuitem/viewfullimage.png',
      click: function() {
        var src = proxifyUrl(url);
        if (getSetting('proxy') === '') {
          src = url;
        }

        var pwin = gui.Window.open('private.html', { title: url, toolbar: false });
        pwin.show();

        pwin.on('loaded', function() {
          pwin.window.document.write('<img src="' + src + '">');
        });
      }
    });

  var previewPageItem = new gui.MenuItem(
    { label: 'Preview Page (No Proxy)',
      icon: 'src/res/menuitem/previewpage.png',
      click: function() {
        var pwin = gui.Window.open('private.html', { title: from, toolbar: false });
        pwin.show();

        pwin.on('loaded', function() {
          // Let's pretend I never wrote this...
          /* jshint maxlen: false */
          pwin.window.document.write('<iframe src="' + from + '" style="border: 0; position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100%" sandbox></iframe>');
        });
      }
    });

  var rotateRightItem = new gui.MenuItem(
    { label: 'Rotate Right',
      icon: 'src/res/menuitem/rotateright.png',
      click: function() {
        var degrees = getRotationDegrees($('img[id="' + md5(url) + '"]'));
        $('img[id="' + md5(url) + '"]').rotate(degrees + 90);
      }
    });

  var rotateLeftItem = new gui.MenuItem(
    { label: 'Rotate Left',
      icon: 'src/res/menuitem/rotateleft.png',
      click: function() {
        var degrees = getRotationDegrees($('img[id="' + md5(url) + '"]'));
        $('img[id="' + md5(url) + '"]').rotate(degrees - 90);
      }
    });

  var copyImageUrlItem = new gui.MenuItem(
    { label: 'Copy Image URL',
      icon: 'src/res/menuitem/copyimageurl.png',
      click: function() {
        clipboard.set(safeDecodeURIComponent(url), 'text');
      }
    });

  var copyPageUrlItem = new gui.MenuItem(
    { label: 'Copy Page URL',
      icon: 'src/res/menuitem/copypageurl.png',
      click: function() {
        clipboard.set(safeDecodeURIComponent(from), 'text');
      }
    });

  var saveImageItem = new gui.MenuItem(
    { label: 'Save Image',
      icon: 'src/res/menuitem/saveimage.png',
      click: function() {
        var imageData = '';

        var options = { url: safeDecodeURIComponent(url),
                        proxy: getSetting('proxy'),
                        encoding: 'binary',
                        headers: { 'User-Agent': useragent } };

        request(options, function(error, response, body) {
          var content = new Buffer(body, 'binary');
          var fileName = getFileName(url);

          fdialogs.saveFile(content, fileName, function(err, path) {
            if (err) {
              throwApplicationError('<p>An error occured while trying to save the image.</p><code>' + err + '</code>');
            }
          });
        });
      }
    });

  var saveExifDataItem = new gui.MenuItem(
    { label: 'Save EXIF Data',
      icon: 'src/res/menuitem/saveexifdata.png',
      click: function() {
        /* jshint quotmark: false */
        exifData = window.atob(exifData).replace(/<br\s*[\/]?>/gi, "\n");

        var content = new Buffer(exifData, 'utf-8');
        var fileName = getFileName(url) + '.txt';

        fdialogs.saveFile(content, fileName, function(err, path) {
          if (err) {
            throwApplicationError('<p>An error occured while trying to save the EXIF data.</p><code>' + err + '</code>');
          }
        });
      }
    });

  // It's my party and I'll cry if I want to.
  menu.append(viewFullImageItem);
  menu.append(previewPageItem);
  menu.append(copyImageUrlItem);
  menu.append(copyPageUrlItem);
  menu.append(new gui.MenuItem({ type: 'separator' }));
  menu.append(saveImageItem);
  menu.append(saveExifDataItem);
  menu.append(new gui.MenuItem({ type: 'separator' }));
  menu.append(rotateRightItem);
  menu.append(rotateLeftItem);
  menu.append(flipImageItem);
  menu.append(new gui.MenuItem({ type: 'separator' }));
  menu.append(searchOnTinEyeItem);
  menu.append(searchOnGoogleItem);
  menu.append(genderAgeItem);
  menu.popup(x, y);
}

/**
 * Retrieves a setting from the browser's local storage
 * @param string name - The name of the setting.
 */
function getSetting(name) {
  var defaultSettings = {
    'proxy': '',
    'local-proxy-port': '',
    'deletion': 'shred-images'
  };

  if (localStorage.getItem(name)) {
    return localStorage.getItem(name);
  } else {
    return defaultSettings[name];
  }
}

/**
 * Saves a setting (either creating or modifying) in the browser's local
 * storage.
 * @param string name - The name of the setting.
 * @param string value - The value of the setting.
 */
function saveSetting(name, value) {
  localStorage.setItem(name, value);
}

/**
 * Allows a URL to be accessed over a user configurable proxy server.
 * @param string url - The URL to proxy.
 */
function proxifyUrl(url) {
  return 'http://127.0.0.1:' + getSetting('local-proxy-port') +
         '/get?url=' + url;
}

/**
 * Throws an error message to the user and then returns.
 * @param string message - The error message to display to the user.
 */
function throwApplicationError(message) {
  $('#error-message').html(message);
  $('#error-modal').modal('show');
  return;
}

/**
 * Tracks the cursor's position and stores the location.
 * @param event e - The event to on which it's triggered.
 */
function readMouseMove(e) {
  x = e.clientX;
  y = e.clientY;
}

$(document).ready(function() {
  document.onmousemove = readMouseMove;

  document.onkeydown = function(e) {
    // Debug console (` key)
    if (e.keyCode === 192) {
      e.preventDefault();
      gui.Window.get().showDevTools();
      return false;
    }
  };

  http.createServer(function(req, resp) {
    if (req.url.substring(0, 9) === '/get?url=') {
      if (req.method === 'GET') {
        var imageUrl = urlHelper.parse(req.url, true);

        /* jshint camelcase: false */
        var validatorOptions = { protocols: ['http','https'],
                                 require_tld: true,
                                 require_protocol: true };

        if (validator.isURL(imageUrl.query.url, validatorOptions) === false) {
          resp.writeHead(200, { 'Content-Type': 'text/plain' });
          resp.end('BADURL');
          return;
        }

        var options = { url: safeDecodeURIComponent(imageUrl.query.url),
                        proxy: getSetting('proxy'),
                        headers: { 'User-Agent': useragent } };

        request(options).pipe(resp);
      }
    }
  }).listen(getSetting('local-proxy-port'));

  if (getSetting('proxy') === '') {
    $('#no-proxy-warning').removeClass('hidden');
  }

  // We need to reset the age and gender otherwise we're left with
  // stale data.
  $('#age-gender-modal').on('hidden.bs.modal', function() {
    $('#age').html('<i>Waiting...</i>');
    $('#gender').html('<i>Waiting...</i>');
  });

  $('#exif-save-button').click(function() {
    /* jshint quotmark: false */
    var exifData = $('#exif-data').html().replace(/<br\s*[\/]?>/gi, "\n");

    var content = new Buffer(exifData, 'utf-8');
    var fileName = $('#exif-title').html() + '.txt';

    fdialogs.saveFile(content, fileName, function(err, path) {
      if (err) {
        throwApplicationError('<p>An error occured while trying to save the EXIF data.</p><code>' + err + '</code>');
      }
    });
  });

  $('a[href="#settings"]').click(function() {
    $('#' + getSetting('deletion')).prop('checked', true);
    $('#http-proxy').val(getSetting('proxy'));
    $('#local-proxy-port').val(getSetting('local-proxy-port'));
    $('#settings-modal').modal('show');
    return false;
  });

  $('a[href="#top"]').click(function() {
    $('html, body').animate({ scrollTop: 0 }, 'slow');
    return false;
  });

  $('#eor').click(function() {
    $('html, body').animate({ scrollTop: 100 }, 'slow');
    return false;
  });

  $('#save-settings').click(function() {
    if ($('#http-proxy').val() !== '' && $('#local-proxy-port').val() === '') {
      alert('You must specify an unused local port to use a proxy.');
      return false;
    }

    if ($('#local-proxy-port').val() !== getSetting('local-proxy-port')) {
      alert('You must restart Open Source Media for these changes to take ' +
            'effect.');
    }

    if ($('#keep-images').is(':checked')) {
      saveSetting('deletion', 'keep-images');
    } else if ($('#delete-images').is(':checked')) {
      saveSetting('deletion', 'delete-images');
    } else if ($('#shred-images').is(':checked')) {
      saveSetting('deletion', 'shred-images');
    }

    saveSetting('local-proxy-port', $('#local-proxy-port').val());

    saveSetting('proxy', $('#http-proxy').val());

    if (getSetting('proxy') === '') {
      $('#no-proxy-warning').removeClass('hidden');
    } else {
      $('#no-proxy-warning').addClass('hidden');
    }

    $('#settings-modal').modal('hide');
  });

  $('a[href="#help"]').click(function() {
    gui.Shell.openExternal('http://git.io/B-r8LA');
  });

  $('#search-form').on('submit', function() {
    $('#images').html('');
    imageSearch($('#query').val());
    return false;
  });
});


// The functions below are generic and non-specific to OSM.

/**
 * Takes a string and capitalizes the first letter of each word.
 * @param string str - The string to convert to uppercase.
 */
function ucwords(str) {
    return (str + '').replace(/^([a-z])|\s+([a-z])/g, function($1) {
        return $1.toUpperCase();
    });
}

/**
 * Takes a URL and parses the file name out of it. Example:
 * http://www.example.com/images/logo.png -> logo.png
 * @param string url - The URL to parse.
 */
function getFileName(url) {
  // NOTE: I tried to get this to unescape the file name, but failed. Epicly.
  // If you know how to do this, feel free to submit a pull request.
  var parsedUrl = urlHelper.parse(url);
  var splitUrl = parsedUrl.path.split('/');
  return splitUrl[splitUrl.length-1];
}

/**
 * Takes a URL and parses the domain name out of it. Example:
 * http://www.example.com/images/logo.png -> www.example.com
 * @param string url - The URL to parse.
 */
function getDomain(url) {
  var parsedUrl = urlHelper.parse(url);
  return parsedUrl.hostname;
}

/**
 * Searches for a binary file and returns whether it was found or not.
 * @param string binary - The name of the binary to search for.
 * @param function cb - The function callback.
 */
function isBinaryInstalled(binary, cb){
  exec(binary,
    function(error, stdout, stderr) {
      if (stderr || error) {
        cb(false);
      } else {
        cb(true);
      }
  });
}

/**
 * Takes a URL and decodes it, if possible. If it can't it returns the
 * original URL.
 * @param string url - The URL to decode.
 */
function safeDecodeURIComponent(url) {
  try {
    return decodeURIComponent(url);
  } catch (ex) {
    return url;
  }
}
