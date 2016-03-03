﻿# <img src="https://raw.githubusercontent.com/oceanswave/lorgnette/master/lorgnette.png" alt="Lorgnette" width="48"> Lorgnette

Allows Pluralsight courses to be watched without user input.
---

Ever want to repurpose that big display in the lobby to show super-awesome Pluralsight videos to make your customers agog at your firm's tech savviness?


Or perhaps you want to watch a bunch of Pluralsight videos at one time? You've got your HDMI cable out and hooked your laptop to your big-screen and you're ready to have a Pluralsight marathon!


But Pluralsight prompts you every 6-10 minutes to continue the module. Ug! Who has time for all that "continue module" modal dialog button pressing?!

Needlessly click no longer! Lorgnette is here to save the day! Display Pluralsight as a Kiosk in your lobby or binge watch Pluralsight videos from the comfort of your couch.

#####What it does:
Launched from the console, Lorgnette auto-logs into a Pluralsight account and plays course videos. When the end of a module is reached, Lorgnette auto-clicks "continue module" popups. It also minimizes the module listing when a course is played so you don't have to.

Lorgnette can also auto-play all videos in a playlist or all results from a term search. Lorgnette will auto-load and play the next course in the playlist so you don't have to.

#####What is this black magic?
Lorgnette is written in node and allows for cross-platform (Tested on OSx and Win 10) browser automation via electron through nightmare. Since this is browser automation, Pluralsight metrics are still captured.

Lorgnette also uses PouchDB to store the full Pluralsight course listing locally so that retrieving a random course is done locally. It pulls the course listing down on first run and every 7 days thereafter. 

It's also a fun experiment in node, electron, nightmare, promises, ES6 function generators and coroutines. Yeah, man! Love me some coroutines!
#####Installation:
Ensure Node and Git are installed.

You can easily do this on windows with [Chocolatey](https://chocolatey.org/).

OSx with [HomeBrew](http://brew.sh/).

I aptly assume you Linux guys know what you're doing.

```
# Clone the repository
$ git clone https://github.com/oceanswave/lorgnette
# Go into the repository
$ cd lorgnette
# Install dependencies
$ npm install
```

Once installed, Lorgnette can be started with:

```
$ node . --username [pluralsight_username] --password [pluralsight_password]
```
Which will login to Pluralsight with the specified credentials and play random courses until the end of time.

#####Options:

|CLI Argument | Optional/Required | Description
|-------------|-------------------|--------------------|
|username | Required | The username of the subscriber to run the kiosk as.|
|password | Required | The password of the subscriber to run the kiosk as.|
|headless | Optional | Don't display a window. Pluralsight videos will continue to play, however, a UI will not be displayed.|
|fullscreen | Optional | Run the kiosk in fullscreen mode.|
|forceCourseListingUpdate | Optional | Force a course listing update. If not specified, the course listing is only retrieved once every 7 days.|
|startAt | Optional | Specify a specific course by id to start playback at.|
|continue| Optional | Specify that Lorgnette should continue at the last course watched |
|playlist| Optional | Specify that Lorgnette should display courses in the specified Pluralsight playlist. (Playlist can be mutated while displaying) |
|search| Optional | Specify that Lorgnette should display courses with the specified search terms. |

Note:
username/password can be specified via environment variables rather than CLI arguments.
Use lorgnette_ps_username/lorgnette_ps_password.

#####Examples:

Watch random Pluralsight videos in fullscreen mode until the sun expands, evaporating the earth's oceans, eventually enveloping the earth and imploding into its core.
```
node . --username "myUser" --password "mySecretPass" --fullscreen
```

Watch, in a window, the course on Video Studio Code, then, random Pluralsight videos until the sun implodes.
```
node . --username "myUser" --password "mySecretPass" --startAt video-studio-code
```

Watch random Pluralsight courses in the search results for "SharePoint" until the sun burns out.
```
node . --username "myUser" --password "mySecretPass" --search "SharePoint"
```

Resume watching the previous course watched on Pluralsight, then, random Pluralsight videos until entropy wins.
```
node . --username "myUser" --password "mySecretPass" --continue
```

Watch all courses in the user's Pluralsight playlist named "My playlist" until the universe cools to 0 kelvin.
```
node . --username "myUser" --password "mySecretPass" --playlist "My playlist"
```

Watch all courses in the playlist "My playlist" headlessly (e.g. without a window) until the universe turns dark.
```
node . --username "myUser" --password "mySecretPass" --playlist "My playlist" --headless
```

Continue watching the previously watched course, then watch all videos in the playlist "My playlist" headlessly (e.g. without a window).
```
node . --username "myUser" --password "mySecretPass" --playlist "My playlist" --headless
```

On Windows, set an environment variable of the username/password and continue the last course watched.
```
set lorgnette_ps_username=myUser
set lorgnette_ps_password=mySecretPass
node . --continue
```

Force the full course listing to be retrieved, then watch random courses forever...rever...ever..ever.ver.r.
```
node . --username "myUser" --password "mySecretPass" --forceCourseListingUpdate
```

##### Stopping:

What? You DON'T to watch courses until the end of time?!

Well then, simply close the browser window, or ctrl-c the process.

Cosmological crisis adverted! (Just think of the power bill you just saved!)
##### Debugging:

To display additional information set the following environment variable:

```
SET DEBUG=lorgnette*
```

##### Auto-play on system start.

So you truly want to run lorgnette until the end of time and want to ensure that courses are played immediately upon startup?

I like your train of thought! Fortunately, lorgnette works well with (pm2)[http://pm2.keymetrics.io/]!!

Install pm2
```
$ npm install pm2 -g
```

and let pm2 start and monitor the process

```
pm2 start app.js --continue
```

then have pm2 start lorgnette at system startup with

```
pm2 startup
pm2 save
```

(see here for full details)[http://pm2.keymetrics.io/docs/usage/startup/]

######Why "lorgnette"?
Because Pluralsight is cool, but [Lorgnettes](https://en.wikipedia.org/wiki/Lorgnette) are fashionable
