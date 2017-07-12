const config = require('./config');
const github = require('./utils/github');
const dialogActions = require('./utils/dialogActions');

const REPOSITORY_SLOT = 'Repository';

/**
 * cleanupSlotInput - cleanup slot input, removing any trailing question mark.
 *
 * @param slot - A slot value.
 * @returns - A slot value, with any question mark replaced.
 */
function cleanupSlotInput(repoName) {
  return repoName;
  //return repoName ? repoName.replace(/\?$/, '') : repoName;
}

/**
 * isRepositorySyntacticallyCorrect - Returns true if the repo name syntax is valid.
 *
 * @param repoName - The repo name.
 * @returns - True if the repo is syntactically correct.
 */
function isRepositorySyntacticallyCorrect(repoName) {
  return /(.+)\/(.+)/.test(repoName);
}

/**
 * repositoryHasBeenValidated - Checks to discover if repository
   has previously been validated
 *
 * @param sessionAttributes - The session attributes
 * @param repositoryName - The repository name from the slot.
 * @returns - Boolean
 */
function repositoryHasBeenValidated(sessionAttributes, repositoryName) {
  return sessionAttributes.validatedRepositories &&
    sessionAttributes.validatedRepositories.split(',').includes(repositoryName);
}

/**
 * setRepositoryValidated - Adds the repository to array of validated
   repositories
 *
 * @param sessionAttributes - The session attributes
 * @param repositoryName - The repository name from the slot.
 */
function setRepositoryValidated(sessionAttributes, repositoryName) {
  const validatedArray = sessionAttributes.validatedRepositories ?
    sessionAttributes.validatedRepositories.split(',') :
    [];

  validatedArray.push(repositoryName);
  sessionAttributes.validatedRepositories = validatedArray.join(',');
}

/**
 * elicitRepositorySlot - Elicts a request for the repository slot.
 *
 * @param callback - The lambda callback.
 * @param event - The incoming event.
 * @param message - The message to send.
 */
function elicitRepositorySlot(callback, event, message) {
  callback(null, dialogActions.elicitSlot(event.sessionAttributes,
    event.currentIntent.name, event.currentIntent.slots, REPOSITORY_SLOT, {
      contentType: 'PlainText',
      content: message
    }));
}

/**
 * repoExists - Returns a promise which resolves with true if the repo exists.
 *
 * @param repositoryName - The repository name.
 * @returns - A promise which resolves with true if the repo exists.
 */
function repoExists(repositoryName) {
  return github.login(config.GITHUB_USERNAME, config.GITHUB_PASSWORD)
    .then((token) => {
      return github.get(token, `/repos/${repositoryName}`);
    })
    .then(() => {
      //  We only resolve for a 200 class response, i.e. repo exists.
      return true;
    })
    .catch((err) => {
      //  If the repo couldn't be found, let the user know.
      if(err.statusCode === 404) {
        return false;
      }

      throw err;
    });
}

/**
 * validateSession - Ensures that we have sufficient session data. Will initiate
   dialog actions to get session data if needed.
 *
 * @param event - The lex event.
 * @param context - The lex context.
 * @param callback - The lex callback.
 * @returns - A promise which resolves with true if the session is valid and 
   dialog should continue, false if data needs to be elicited and the caller
   should return.
 */
function validateSession(event, context, callback) {
  //  Empty slots/sessionAttributes come in as null, rather than an empty
  //  object. Ensure they are objects (makes the subequent logic easier).
  if (!callback) throw new Error('Callback cannot be null');
  if (!event.sessionAttributes) event.sessionAttributes = {};
  if (!event.currentIntent.slots) event.currentIntent.slots = {};

  return new Promise((resolve) => {
    const sessionRepositoryName = event.sessionAttributes[REPOSITORY_SLOT];
    const slotRepositoryName = cleanupSlotInput(event.currentIntent.slots[REPOSITORY_SLOT]);

    //  If we don't have a slot...
    if (!slotRepositoryName) {
      //  ...and we don't have a session, we're outta luck.
      if (!sessionRepositoryName) {
        elicitRepositorySlot(callback, event, 'What is the repository name?');
        return resolve(false);
      }

      //  We've got a repo in the session. Copy it into the slot and we're good.
      event.currentIntent.slots[REPOSITORY_SLOT] = sessionRepositoryName;
      return resolve(true);
    }

    //  OK - we've got a slot. But now we need to validate it.

    //  If we've got the repo in the slot, and it matches the session, we're good.
    if (slotRepositoryName === sessionRepositoryName) {
      return resolve(true);
    }

    // Check to see if the repository has been validated previously in the
    // session, if so pop it in the sessionAttribute as our current repo
    // and continue
    if (repositoryHasBeenValidated(event.sessionAttributes, slotRepositoryName)) {
      event.sessionAttributes[REPOSITORY_SLOT] = slotRepositoryName;
      return resolve(true);
    }

    //  Validate the syntax of the repo.
    if (!isRepositorySyntacticallyCorrect(slotRepositoryName)) {
      const message = `'${slotRepositoryName}' doesn't look like a valid repo name, can you type it again? Don't forget to include the owner, such as 'twbs/bootstrap'.`;
      elicitRepositorySlot(callback, event, message);
      return resolve(false);
    }

    //  Validate the repository exists.
    return repoExists(`/repos/${slotRepositoryName}`)
      .then((exists) => {
        if (exists) {
          event.sessionAttributes[REPOSITORY_SLOT] = slotRepositoryName;
          setRepositoryValidated(event.sessionAttributes, slotRepositoryName);
          return resolve(true);
        } else {
          const message = `I'm sorry, I couldn't find a GitHub repo called ${slotRepositoryName}. Can you make sure I have access to the repo if it is private, ensure the name is in the format 'user/project' and type it again?`;
          elicitRepositorySlot(callback, event, message);
          return resolve(false);
        }
      });
  });
}

module.exports = validateSession;
