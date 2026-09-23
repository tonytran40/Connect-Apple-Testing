const { logPickerDiagnostics } = require('./attachmentPhotoPickerNavigation');
const { tapAllPhotosInPicker } = require('./attachmentPhotoPickerSelection');
const {
  sendComposerDraft,
  tapDoneInPhotoPicker,
  waitForAttachmentDraftInComposer,
  waitForPhotoPicker,
} = require('./attachmentPhotoPickerState');

module.exports = {
  logPickerDiagnostics,
  sendComposerDraft,
  tapAllPhotosInPicker,
  tapDoneInPhotoPicker,
  waitForAttachmentDraftInComposer,
  waitForPhotoPicker,
};
