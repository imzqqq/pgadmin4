import '../helper/enzyme.helper';
import { createMount } from '@material-ui/core/test-utils';
import ExtensionsSchema from '../../../pgadmin/browser/server_groups/servers/databases/extensions/static/js/extension.ui';
import {genericBeforeEach, getCreateView, getEditView, getPropertiesView} from '../genericFunctions';

describe('ExtensionSchema', ()=>{
  let mount;
  let schemaObj = new ExtensionsSchema(
    {
      extensionsList: ()=>[],
      schemaList: ()=>[],
    }
  );
  let getInitData = ()=>Promise.resolve({});

  /* Use createMount so that material ui components gets the required context */
  /* https://material-ui.com/guides/testing/#api */
  beforeAll(()=>{
    mount = createMount();
  });

  afterAll(() => {
    mount.cleanUp();
  });

  beforeEach(()=>{
    genericBeforeEach();
  });

  it('create', ()=>{
    mount(getCreateView(schemaObj));
  });

  it('edit', ()=>{
    mount(getEditView(schemaObj, getInitData));
  });

  it('properties', ()=>{
    mount(getPropertiesView(schemaObj, getInitData));
  });

  it('validate', ()=>{
    let state = {};
    let setError = jasmine.createSpy('setError');

    state.name = null;
    schemaObj.validate(state, setError);
    expect(setError).toHaveBeenCalledWith('name', 'Name cannot be empty.');
  });
});

