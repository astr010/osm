Open Source Media Help
=======

This document tries to help users with a wide range of topics, including questions and issues they may come across while using or hacking upon OSM. It tries to be as non-technical as possible, apart from when discussing technical topics. This document does not cover installation as it assumes you have everything setup.

If there's anything wrong here, or you wish to make a change/improvement, feel free to create a pull request.

Application Errors
=======

```
ajax.googleapis.com returned a non-JSON response. This usually happens when you are using a proxy and a network error occurred.
```

Some proxy servers return weird or incorrect responses when they cannot connect to the end server. This error could be caused by any number of things. Make sure the proxy server you provided is working correctly.

---------------------------------------

```
ajax.googleapis.com returned an error.

Suspected Terms of Service Abuse. Please see http://code.google.com/apis/errors
```

Google isn't liking what you're doing -- perhaps you were sending too many requests or searching for something questionable? If this is becoming a problem for you try using a proxy server. Tor + Privoxy is an acceptable solution.

Something's not working!
=======

You may have found a bug, have a weird setup, or you may be doing something wrong. If you believe you have found a bug, please [create a new issue](https://github.com/nmalcolm/osm/issues/new) and I'll look in to it. Provide as much information as possible including operating system, Node-webkit version, OSM version, how to reproduce the issue, and anything else you feel might help in fixing the issue.

You may have outdated software, an unsupported OS, or simply a bad installation. In any of these cases, I can't really help you. Upgrade your system, use a modern one, and don't screw it up. Have you tried [Xubuntu](http://xubuntu.org/)?
