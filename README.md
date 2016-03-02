# <img src="https://raw.githubusercontent.com/oceanswave/lorgnette/master/lorgnette.png" alt="Lorgnette" width="48"> Lorgnette

Allows a user to display Pluralsight videos as a Kiosk.
---

Ever want to repurpose that big display in the lobby to show super-awesome Pluralsight videos to make your customers agog at your firm's tech-savvyness?


Or perhaps you want to watch a bunch of Pluralsight videos at one time? You've got your HDMI cable out and hooked your laptop to your bigscreen and you're ready to have a Pluralsight marathon!


But Pluralsight prompts you every 6-10 minutes to continue the module. Ug! Who has time for all that "continue module" modal dialog button pressing?!

Needlessly click no longer! Lorgnette is here to save the day! Display Pluralsight as a Kiosk in your lobby or binge watch Pluralsight videos from the comfort of your couch.

#####What it does:

Via electron through nightmare, Lorgnette logs into a Pluralsight account and plays course videos. Lorgnette bypasses "continue module" popups and remembers what you were last watching so it can continue the next time it is run.

Lorgnette uses PouchDB to store the full Pluralsight course listing locally so that retriving a random course is done locally.

It pulls the course listing down on first run and every 7 days thereafter. 

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
|headless | Optional | Don't display a window. Pluralsight videos will continue to play, however, just no UI will be displayed.|
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
#####Debugging:

To display additional information set the following environment variable:

```
SET DEBUG=lorgnette*
```

