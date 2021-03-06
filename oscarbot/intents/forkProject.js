const dialogActions = require('../utils/dialogActions');
const dialog = require('../utils/dialog');
const failed = require('../utils/dialog/failed');
const github = require('../utils/github');
const i18n = require('../i18n');

function checkConfirmationStatus(event, callback) {
  const confirmationStatus = event.currentIntent.confirmationStatus;
  if (confirmationStatus === 'Denied') {
    return dialog.fulfilled(event, 'Ok, I will not fork the repository.', callback);
  } else if (confirmationStatus === 'None') {
    const repository = event.currentIntent.slots.Repository;
    const username = event.currentIntent.slots.GitHubUsername;

    return callback(null, dialogActions.confirmIntent(event.sessionAttributes,
      event.currentIntent.name,
      event.currentIntent.slots,
      {
        contentType: 'PlainText',
        content: i18n('forkProjectConfirm', {
          repository,
          username
        })
      },
      dialogActions.buildResponseCard('Confirm', null, [{
        text: 'Yes',
        value: 'Yes'
      }, {
        text: 'No',
        value: 'No'
      }])));
  }
}

function handler(event, context, callback) {
  const repository = event.sessionAttributes.Repository;
  const gitHubUsername = event.currentIntent.slots.GitHubUsername;
  const gitHubPassword = event.currentIntent.slots.GitHubPassword;

  //  Elicit the slots if needed.
  if (!gitHubUsername) return dialog.elicitSlot(event, 'GitHubUsername', i18n('forkProjectRequestUsername'), callback);
  if (!gitHubPassword) return dialog.elicitSlot(event, 'GitHubPassword', i18n('forkProjectRequestPassword'), callback);

  //  We'll confirm for this event.
  if (checkConfirmationStatus(event, callback)) return;

  //  OK, time to try and login - as the user who will fork (not as oscar)!
  github.login(gitHubUsername, gitHubPassword)
    .then((token) => {
      return github.post(token, `/repos/${repository}/forks`, {});
    })
    .then((result) => {

      //  Check the result.
      if (result.statusCode !== 202) {
        //  Time to bail...
      }

      //  Create the response.
      const fork = result.body.full_name;
      const response = i18n('forkProjectSuccessResponse', { repository, fork });

      return dialog.fulfilled(event, response, callback);
    })
    .catch((err) => {
      console.log(`Error forking project: ${err}`);
      failed(event, 'Sorry, there was a problem forking the project.', callback);
    });
}

module.exports = {
  handler
};
