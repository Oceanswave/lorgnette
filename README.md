# lorgnette

Allows a user to display PluralSight videos as a Kiosk.

Logs in as a PluralSight subscriber and continuously plays random PluralSight videos until the process is stopped.

#####Installation:
Ensure Node and Git are installed.

```
# Clone the repository
$ git clone https://github.com/oceanswave/lorgnette
# Go into the repository
$ cd lorgnette
# Install dependencies and run the app
$ npm install && node . --username [pluralsight_username] --password [pluralsight_password] [--headless] [--fullScreen] [--forceCourseListingUpdate]
```

#####Options:

CLI Argument | Optional/Required | Description
username | Required | The username of the subscriber to run the kiosk as.
password | Required | The password of the subscriber to run the kiosk as.
headless | Optional | Don't display a window. PluralSight videos will continue to play in the background.
fullscreen | Optional | Run the kiosk in fullscreen mode.
forceCourseListingUpdate | Optional | Force a course listing update. If not specified, the course listing is only retrieved once every 7 days.
startAt | Optional | Specify a specific video by id to start playback at.

Note:
username/password can be specified via environment variables rather than CLI arguments.
Use lorgnette_ps_username/lorgnette_ps_password.

#####Debugging:

To display additional information set the following environment variable:

```
SET DEBUG=lorgnette*
```

