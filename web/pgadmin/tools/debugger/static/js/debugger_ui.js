define([
  'sources/gettext', 'sources/url_for', 'jquery', 'underscore', 'backbone',
  'pgadmin.alertifyjs', 'sources/pgadmin', 'pgadmin.browser',
  'pgadmin.backgrid', 'wcdocker',
], function(
  gettext, url_for, $, _, Backbone, Alertify, pgAdmin, pgBrowser, Backgrid
) {

  var wcDocker = window.wcDocker;

  /*
   * Function used to return the respective Backgrid control based on the data type
   * of function input argument.
   */
  var cellFunction = function(model) {
    var variable_type = model.get('type');

    // if variable type is an array then we need to render the custom control to take the input from user.
    if (variable_type.indexOf('[]') != -1) {
      if (variable_type.indexOf('integer') != -1) {
        return Backgrid.Extension.InputIntegerArrayCell;
      }
      return Backgrid.Extension.InputStringArrayCell;
    }

    switch (variable_type) {
    case 'bool':
      return Backgrid.BooleanCell;
    case 'integer':
        // As we are getting this value as text from sqlite database so we need to type cast it.
      if (model.get('value') != undefined) {
        model.set({
          'value': parseInt(model.get('value')),
        }, {
          silent: true,
        });
      }

      return Backgrid.IntegerCell;
    case 'real':
        // As we are getting this value as text from sqlite database so we need to type cast it.
      if (model.get('value') != undefined) {
        model.set({
          'value': parseFloat(model.get('value')),
        }, {
          silent: true,
        });
      }
      return Backgrid.NumberCell;
    case 'string':
      return Backgrid.StringCell;
    case 'date':
      return Backgrid.DateCell;
    default:
      return Backgrid.Cell;
    }
  };

  /*
   * Function used to return the respective Backgrid string or boolean control based on the data type
   * of function input argument.
   */
  var cellExprControlFunction = function(model) {
    var variable_type = model.get('type');
    if (variable_type.indexOf('[]') != -1) {
      return Backgrid.StringCell;
    }
    return Backgrid.BooleanCell;
  };

  /**
   *  DebuggerInputArgsModel used to represent input parameters for the function to debug
   *  for function objects.
   **/
  var DebuggerInputArgsModel = Backbone.Model.extend({
    defaults: {
      name: undefined,
      type: undefined,
      is_null: undefined,
      expr: undefined,
      value: undefined,
      use_default: undefined,
      default_value: undefined,
    },
    validate: function() {
      if (_.isUndefined(this.get('value')) ||
        _.isNull(this.get('value')) ||
        String(this.get('value')).replace(/^\s+|\s+$/g, '') == '') {
        var msg = gettext('Please enter a value for the parameter.');
        this.errorModel.set('value', msg);
        return msg;
      } else {
        this.errorModel.unset('value');
      }
      return null;
    },
  });

  // Collection which contains the model for function informations.
  var DebuggerInputArgCollections = Backbone.Collection.extend({
    model: DebuggerInputArgsModel,
  });

  // function will enable/disable the use_default column based on the value received.
  var disableDefaultCell = function(d) {
    if (d instanceof Backbone.Model) {
      return d.get('use_default');
    }
    return false;
  };

  // Enable/Disable the control based on the array data type of the function input arguments
  var disableExpressionControl = function(d) {
    if (d instanceof Backbone.Model) {
      var argType = d.get('type');
      if (argType.indexOf('[]') != -1) {
        return false;
      }
      return true;
    }
  };

  var res = function(debug_info, restart_debug, is_edb_proc) {
    if (!Alertify.debuggerInputArgsDialog) {
      Alertify.dialog('debuggerInputArgsDialog', function factory() {
        return {
          main: function(title, debug_info, restart_debug, is_edb_proc) {
            this.preferences = window.top.pgAdmin.Browser.get_preferences_for_module('debugger');
            this.set('title', title);

            // setting value in alertify settings allows us to access it from
            // other functions other than main function.
            this.set('debug_info', debug_info);
            this.set('restart_debug', restart_debug);

            // Variables to store the data sent from sqlite database
            var func_args_data = this.func_args_data = [];

            // As we are not getting pgBrowser.tree when we debug again
            // so tree info will be updated from the server data
            if (restart_debug == 0) {
              var t = pgBrowser.tree,
                i = t.selected(),
                d = i && i.length == 1 ? t.itemData(i) : undefined,
                node = d && pgBrowser.Nodes[d._type];

              if (!d)
                return;

              var treeInfo = node.getTreeNodeHierarchy.apply(node, [i]),
                _Url;

              if (d._type == 'function') {
                // Get the existing function parameters available from sqlite database
                _Url = url_for('debugger.get_arguments', {
                  'sid': treeInfo.server._id,
                  'did': treeInfo.database._id,
                  'scid': treeInfo.schema._id,
                  'func_id': treeInfo.function._id,
                });
              } else if (d._type == 'procedure') {
                // Get the existing function parameters available from sqlite database
                _Url = url_for('debugger.get_arguments', {
                  'sid': treeInfo.server._id,
                  'did': treeInfo.database._id,
                  'scid': treeInfo.schema._id,
                  'func_id': treeInfo.procedure._id,
                });
              } else if (d._type == 'edbfunc') {
                // Get the existing function parameters available from sqlite database
                _Url = url_for('debugger.get_arguments', {
                  'sid': treeInfo.server._id,
                  'did': treeInfo.database._id,
                  'scid': treeInfo.schema._id,
                  'func_id': treeInfo.edbfunc._id,
                });
              } else if (d._type == 'edbproc') {
                // Get the existing function parameters available from sqlite database
                _Url = url_for('debugger.get_arguments', {
                  'sid': treeInfo.server._id,
                  'did': treeInfo.database._id,
                  'scid': treeInfo.schema._id,
                  'func_id': treeInfo.edbproc._id,
                });
              }
            } else {
              // Get the existing function parameters available from sqlite database
              _Url = url_for('debugger.get_arguments', {
                'sid': debug_info.server_id,
                'did': debug_info.database_id,
                'scid': debug_info.schema_id,
                'func_id': debug_info.function_id,
              });
            }
            $.ajax({
              url: _Url,
              method: 'GET',
              async: false,
            })
            .done(function(res) {
              if (res.data.args_count != 0) {
                for (i = 0; i < res.data.result.length; i++) {
                  // Below will format the data to be stored in sqlite database
                  func_args_data.push({
                    'arg_id': res.data.result[i]['arg_id'],
                    'is_null': res.data.result[i]['is_null'],
                    'is_expression': res.data.result[i]['is_expression'],
                    'use_default': res.data.result[i]['use_default'],
                    'value': res.data.result[i]['value'],
                  });
                }
              }
            })
            .fail(function() {
              Alertify.alert(
                gettext('Debugger Error'),
                gettext('Unable to fetch the arguments from server')
              );
            });

            var argname, argtype, argmode, default_args_count, default_args, arg_cnt;

            var value_header = Backgrid.HeaderCell.extend({
              // Add fixed width to the "value" column
              className: 'width_percent_25',
            });

            var def_val_list = [],
              gridCols = [{
                name: 'name',
                label: gettext('Name'),
                type: 'text',
                editable: false,
                cell: 'string',
              },
              {
                name: 'type',
                label: gettext('Type'),
                type: 'text',
                editable: false,
                cell: 'string',
              },
              {
                name: 'is_null',
                label: gettext('Null?'),
                type: 'boolean',
                cell: 'boolean',
              },
              {
                name: 'expr',
                label: gettext('Expression?'),
                type: 'boolean',
                cellFunction: cellExprControlFunction,
                editable: disableExpressionControl,
              },
              {
                name: 'value',
                label: gettext('Value'),
                type: 'text',
                editable: true,
                cellFunction: cellFunction,
                headerCell: value_header,
              },
              {
                name: 'use_default',
                label: gettext('Use Default?'),
                type: 'boolean',
                cell: 'boolean',
                editable: disableDefaultCell,
              },
              {
                name: 'default_value',
                label: gettext('Default value'),
                type: 'text',
                editable: false,
                cell: 'string',
              },
              ];

            var my_obj = [];
            var func_obj = [];

            // Below will calculate the input argument id required to store in sqlite database
            var input_arg_id = this.input_arg_id = [],
              k;
            if (debug_info['proargmodes'] != null) {
              var argmode_1 = debug_info['proargmodes'].split(',');
              for (k = 0; k < argmode_1.length; k++) {
                if (argmode_1[k] == 'i' || argmode_1[k] == 'b' ||
                  (is_edb_proc && argmode_1[k] == 'o')) {
                  input_arg_id.push(k);
                }
              }
            } else {
              var argtype_1 = debug_info['proargtypenames'].split(',');
              for (k = 0; k < argtype_1.length; k++) {
                input_arg_id.push(k);
              }
            }

            argtype = debug_info['proargtypenames'].split(',');

            if (debug_info['proargmodes'] != null) {
              argmode = debug_info['proargmodes'].split(',');
            }

            if (debug_info['pronargdefaults']) {
              default_args_count = debug_info['pronargdefaults'];
              default_args = debug_info['proargdefaults'].split(',');
              arg_cnt = default_args_count;
            }

            var vals, values, index, use_def_value, j;

            if (debug_info['proargnames'] != null) {
              argname = debug_info['proargnames'].split(',');

              // It will assign default values to "Default value" column
              for (j = (argname.length - 1); j >= 0; j--) {
                if (debug_info['proargmodes'] != null) {
                  if (argmode[j] == 'i' || argmode[j] == 'b' ||
                    (is_edb_proc && argmode[j] == 'o')) {
                    if (arg_cnt) {
                      arg_cnt = arg_cnt - 1;
                      def_val_list[j] = default_args[arg_cnt];
                    } else {
                      def_val_list[j] = '<No default value>';
                    }
                  }
                } else if (arg_cnt) {
                  arg_cnt = arg_cnt - 1;
                  def_val_list[j] = default_args[arg_cnt];
                } else {
                  def_val_list[j] = '<No default value>';
                }
              }

              if (argtype.length != 0) {
                for (i = 0; i < argtype.length; i++) {
                  if (debug_info['proargmodes'] != null) {
                    if (argmode[i] == 'i' || argmode[i] == 'b' ||
                      (is_edb_proc && argmode[i] == 'o')) {
                      use_def_value = false;
                      if (def_val_list[i] != '<No default value>') {
                        use_def_value = true;
                      }
                      my_obj.push({
                        'name': argname[i],
                        'type': argtype[i],
                        'use_default': use_def_value,
                        'default_value': def_val_list[i],
                      });
                    }
                  } else {
                    use_def_value = false;
                    if (def_val_list[i] != '<No default value>') {
                      use_def_value = true;
                    }
                    my_obj.push({
                      'name': argname[i],
                      'type': argtype[i],
                      'use_default': use_def_value,
                      'default_value': def_val_list[i],
                    });
                  }
                }
              }

              // Need to update the func_obj variable from sqlite database if available
              if (func_args_data.length != 0) {
                for (i = 0; i < func_args_data.length; i++) {
                  if (debug_info['proargmodes'] != null &&
                    (argmode[i] == 'o' && !is_edb_proc)) {
                    continue;
                  }

                  index = func_args_data[i]['arg_id'];
                  values = [];
                  if (argtype[index].indexOf('[]') != -1) {
                    vals = func_args_data[i]['value'].split(',');
                    if (argtype[index].indexOf('integer') != -1) {
                      _.each(vals, function(val) {
                        values.push({
                          'value': parseInt(val),
                        });
                      });
                    }
                    _.each(vals, function(val) {
                      values.push({
                        'value': val,
                      });
                    });
                  } else {
                    values = func_args_data[i]['value'];
                  }

                  func_obj.push({
                    'name': argname[index],
                    'type': argtype[index],
                    'is_null': func_args_data[i]['is_null'] ? true : false,
                    'expr': func_args_data[i]['is_expression'] ? true : false,
                    'value': values,
                    'use_default': func_args_data[i]['use_default'] ? true : false,
                    'default_value': def_val_list[index],
                  });
                }
              }
            } else {
              /*
               Generate the name parameter if function do not have arguments name
               like dbgparam1, dbgparam2 etc.
              */
              var myargname = [];

              for (i = 0; i < argtype.length; i++) {
                myargname[i] = 'dbgparam' + (i + 1);
              }

              // If there is no default arguments
              if (!debug_info['pronargdefaults']) {
                for (i = 0; i < argtype.length; i++) {
                  my_obj.push({
                    'name': myargname[i],
                    'type': argtype[i],
                    'use_default': false,
                    'default_value': '<No default value>',
                  });
                  def_val_list[i] = '<No default value>';
                }
              } else {
                // If there is default arguments
                //Below logic will assign default values to "Default value" column
                for (j = (myargname.length - 1); j >= 0; j--) {
                  if (debug_info['proargmodes'] == null) {
                    if (arg_cnt) {
                      arg_cnt = arg_cnt - 1;
                      def_val_list[j] = default_args[arg_cnt];
                    } else {
                      def_val_list[j] = '<No default value>';
                    }
                  } else {
                    if (arg_cnt) {
                      arg_cnt = arg_cnt - 1;
                      def_val_list[j] = default_args[arg_cnt];
                    } else {
                      def_val_list[j] = '<No default value>';
                    }
                  }
                }

                for (i = 0; i < argtype.length; i++) {
                  if (debug_info['proargmodes'] == null) {
                    use_def_value = false;
                    if (def_val_list[i] != '<No default value>') {
                      use_def_value = true;
                    }
                    my_obj.push({
                      'name': myargname[i],
                      'type': argtype[i],
                      'use_default': use_def_value,
                      'default_value': def_val_list[i],
                    });
                  } else {
                    if (argmode[i] == 'i' || argmode[i] == 'b' ||
                      (is_edb_proc && argmode[i] == 'o')) {
                      use_def_value = false;
                      if (def_val_list[i] != '<No default value>') {
                        use_def_value = true;
                      }
                      my_obj.push({
                        'name': myargname[i],
                        'type': argtype[i],
                        'use_default': use_def_value,
                        'default_value': def_val_list[i],
                      });
                    }
                  }
                }
              }

              // Need to update the func_obj variable from sqlite database if available
              if (func_args_data.length != 0) {
                for (i = 0; i < func_args_data.length; i++) {
                  index = func_args_data[i]['arg_id'];
                  values = [];
                  if (argtype[index].indexOf('[]') != -1) {
                    vals = func_args_data[i]['value'].split(',');
                    if (argtype[index].indexOf('integer') != -1) {
                      _.each(vals, function(val) {
                        values.push({
                          'value': parseInt(val),
                        });
                      });
                    }
                    _.each(vals, function(val) {
                      values.push({
                        'value': val,
                      });
                    });
                  } else {
                    values = func_args_data[i]['value'];
                  }
                  func_obj.push({
                    'name': myargname[index],
                    'type': argtype[index],
                    'is_null': func_args_data[i]['is_null'] ? true : false,
                    'expr': func_args_data[i]['is_expression'] ? true : false,
                    'value': values,
                    'use_default': func_args_data[i]['use_default'] ? true : false,
                    'default_value': def_val_list[index],
                  });
                }
              }
            }

            // Check if the arguments already available in the sqlite database
            // then we should use the existing arguments
            if (func_args_data.length == 0) {
              this.debuggerInputArgsColl =
                new DebuggerInputArgCollections(my_obj);
            } else {
              this.debuggerInputArgsColl =
                new DebuggerInputArgCollections(func_obj);
            }

            // Initialize a new Grid instance
            if (this.grid) {
              this.grid.remove();
              this.grid = null;
            }
            var grid = this.grid = new Backgrid.Grid({
              columns: gridCols,
              collection: this.debuggerInputArgsColl,
              className: 'backgrid table-bordered',
            });

            grid.render();
            $(this.elements.content).html(grid.el);

            // For keyboard navigation in the grid
            // we'll set focus on checkbox from the first row if any
            var grid_checkbox = $(grid.el).find('input:checkbox').first();
            if (grid_checkbox.length) {
              setTimeout(function() {
                grid_checkbox.trigger('click');
              }, 250);
            }

          },
          settings: {
            debug_info: undefined,
            restart_debug: undefined,
          },
          setup: function() {
            return {
              buttons: [{
                text: gettext('Debug'),
                key: 13,
                className: 'btn btn-primary',
              },
              {
                text: gettext('Cancel'),
                key: 27,
                className: 'btn btn-primary',
              },
              ],
              // Set options for dialog
              options: {
                //disable both padding and overflow control.
                padding: !1,
                overflow: !1,
                model: 0,
                resizable: true,
                maximizable: true,
                pinnable: false,
                closableByDimmer: false,
                modal: false,
              },
            };
          },
          // Callback functions when click on the buttons of the Alertify dialogs
          callback: function(e) {
            if (e.button.text === gettext('Debug')) {

              // Initialize the target once the debug button is clicked and
              // create asynchronous connection and unique transaction ID
              var self = this;

              // If the debugging is started again then treeInfo is already
              // stored in this.data so we can use the same.
              if (self.setting('restart_debug') == 0) {
                var t = pgBrowser.tree,
                  i = t.selected(),
                  d = i && i.length == 1 ? t.itemData(i) : undefined,
                  node = d && pgBrowser.Nodes[d._type];

                if (!d)
                  return;

                var treeInfo = node.getTreeNodeHierarchy.apply(node, [i]);
              }

              var args_value_list = [];
              var sqlite_func_args_list = this.sqlite_func_args_list = [];
              var int_count = 0;

              this.grid.collection.each(function(m) {

                // Check if value is set to NULL then we should ignore the value field
                if (m.get('is_null')) {
                  args_value_list.push({
                    'name': m.get('name'),
                    'type': m.get('type'),
                    'value': 'NULL',
                  });
                } else {
                  // Check if default value to be used or not
                  if (m.get('use_default')) {
                    args_value_list.push({
                      'name': m.get('name'),
                      'type': m.get('type'),
                      'value': m.get('default_value'),
                    });
                  } else {
                    args_value_list.push({
                      'name': m.get('name'),
                      'type': m.get('type'),
                      'value': m.get('value'),
                    });
                  }
                }

                if (self.setting('restart_debug') == 0) {
                  var f_id;
                  if (d._type == 'function') {
                    f_id = treeInfo.function._id;
                  } else if (d._type == 'procedure') {
                    f_id = treeInfo.procedure._id;
                  } else if (d._type == 'edbfunc') {
                    f_id = treeInfo.edbfunc._id;
                  } else if (d._type == 'edbproc') {
                    f_id = treeInfo.edbproc._id;
                  }

                  // Below will format the data to be stored in sqlite database
                  sqlite_func_args_list.push({
                    'server_id': treeInfo.server._id,
                    'database_id': treeInfo.database._id,
                    'schema_id': treeInfo.schema._id,
                    'function_id': f_id,
                    'arg_id': self.input_arg_id[int_count],
                    'is_null': m.get('is_null') ? 1 : 0,
                    'is_expression': m.get('expr') ? 1 : 0,
                    'use_default': m.get('use_default') ? 1 : 0,
                    'value': m.get('value'),
                  });
                } else {
                  // Below will format the data to be stored in sqlite database
                  sqlite_func_args_list.push({
                    'server_id': self.setting('debug_info').server_id,
                    'database_id': self.setting('debug_info').database_id,
                    'schema_id': self.setting('debug_info').schema_id,
                    'function_id': self.setting('debug_info').function_id,
                    'arg_id': self.input_arg_id[int_count],
                    'is_null': m.get('is_null') ? 1 : 0,
                    'is_expression': m.get('expr') ? 1 : 0,
                    'use_default': m.get('use_default') ? 1 : 0,
                    'value': m.get('value'),
                  });
                }

                int_count = int_count + 1;
              });

              var baseUrl;

              // If debugging is not started again then we should initialize the target otherwise not
              if (self.setting('restart_debug') == 0) {
                if (d._type == 'function') {
                  baseUrl = url_for('debugger.initialize_target_for_function', {
                    'debug_type': 'direct',
                    'sid': treeInfo.server._id,
                    'did': treeInfo.database._id,
                    'scid': treeInfo.schema._id,
                    'func_id': treeInfo.function._id,
                  });
                } else if (d._type == 'procedure') {
                  baseUrl = url_for('debugger.initialize_target_for_function', {
                    'debug_type': 'direct',
                    'sid': treeInfo.server._id,
                    'did': treeInfo.database._id,
                    'scid': treeInfo.schema._id,
                    'func_id': treeInfo.procedure._id,
                  });
                } else if (d._type == 'edbfunc') {
                  baseUrl = url_for('debugger.initialize_target_for_function', {
                    'debug_type': 'direct',
                    'sid': treeInfo.server._id,
                    'did': treeInfo.database._id,
                    'scid': treeInfo.schema._id,
                    'func_id': treeInfo.edbfunc._id,
                  });
                } else if (d._type == 'edbproc') {
                  baseUrl = url_for('debugger.initialize_target_for_function', {
                    'debug_type': 'direct',
                    'sid': treeInfo.server._id,
                    'did': treeInfo.database._id,
                    'scid': treeInfo.schema._id,
                    'func_id': treeInfo.edbproc._id,
                  });
                }

                $.ajax({
                  url: baseUrl,
                  method: 'POST',
                  data: {
                    'data': JSON.stringify(args_value_list),
                  },
                })
                .done(function(res) {

                  var url = url_for(
                    'debugger.direct', {
                      'trans_id': res.data.debuggerTransId,
                    }
                  );

                  if (self.preferences.debugger_new_browser_tab) {
                    window.open(url, '_blank');
                  } else {
                    pgBrowser.Events.once(
                      'pgadmin-browser:frame:urlloaded:frm_debugger',
                      function(frame) {
                        frame.openURL(url);
                      });

                    // Create the debugger panel as per the data received from user input dialog.
                    var dashboardPanel = pgBrowser.docker.findPanels('properties'),
                      panel = pgBrowser.docker.addPanel(
                        'frm_debugger', wcDocker.DOCK.STACKED, dashboardPanel[0]
                      );

                    panel.focus();

                    // Panel Closed event
                    panel.on(wcDocker.EVENT.CLOSED, function() {
                      var closeUrl = url_for('debugger.close', {
                        'trans_id': res.data.debuggerTransId,
                      });
                      $.ajax({
                        url: closeUrl,
                        method: 'DELETE',
                      });
                    });
                  }
                  var _Url;

                  if (d._type == 'function') {
                    _Url = url_for('debugger.set_arguments', {
                      'sid': treeInfo.server._id,
                      'did': treeInfo.database._id,
                      'scid': treeInfo.schema._id,
                      'func_id': treeInfo.function._id,
                    });
                  } else if (d._type == 'procedure') {
                    _Url = url_for('debugger.set_arguments', {
                      'sid': treeInfo.server._id,
                      'did': treeInfo.database._id,
                      'scid': treeInfo.schema._id,
                      'func_id': treeInfo.procedure._id,
                    });
                  } else if (d._type == 'edbfunc') {
                    // Get the existing function parameters available from sqlite database
                    _Url = url_for('debugger.set_arguments', {
                      'sid': treeInfo.server._id,
                      'did': treeInfo.database._id,
                      'scid': treeInfo.schema._id,
                      'func_id': treeInfo.edbfunc._id,
                    });
                  } else if (d._type == 'edbproc') {
                    // Get the existing function parameters available from sqlite database
                    _Url = url_for('debugger.set_arguments', {
                      'sid': treeInfo.server._id,
                      'did': treeInfo.database._id,
                      'scid': treeInfo.schema._id,
                      'func_id': treeInfo.edbproc._id,
                    });
                  }

                  $.ajax({
                    url: _Url,
                    method: 'POST',
                    data: {
                      'data': JSON.stringify(sqlite_func_args_list),
                    },
                  })
                  .done(function() {})
                  .fail(function() {
                    Alertify.alert(
                      gettext('Debugger Error'),
                      gettext('Unable to set the arguments on the server')
                    );
                  });
                })
                .fail(function(e) {
                  Alertify.alert(
                    gettext('Debugger Target Initialization Error'),
                    e.responseJSON.errormsg
                  );
                });
              } else {
                // If the debugging is started again then we should only set the
                // arguments and start the listener again
                baseUrl = url_for('debugger.start_listener', {
                  'trans_id': self.setting('debug_info').trans_id,
                });

                $.ajax({
                  url: baseUrl,
                  method: 'POST',
                  data: {
                    'data': JSON.stringify(args_value_list),
                  },
                })
                .done(function() {})
                .fail(function(e) {
                  Alertify.alert(
                    gettext('Debugger Listener Startup Error'),
                    e.responseJSON.errormsg
                  );
                });

                // Set the new input arguments given by the user during debugging
                var _Url = url_for('debugger.set_arguments', {
                  'sid': self.setting('debug_info').server_id,
                  'did': self.setting('debug_info').database_id,
                  'scid': self.setting('debug_info').schema_id,
                  'func_id': self.setting('debug_info').function_id,
                });
                $.ajax({
                  url: _Url,
                  method: 'POST',
                  data: {
                    'data': JSON.stringify(sqlite_func_args_list),
                  },
                })
                .done(function() {})
                .fail(function() {
                  Alertify.alert(
                    gettext('Debugger Error'),
                    gettext('Unable to set the arguments on the server')
                  );
                });

              }

              return true;
            }

            if (e.button.text === gettext('Cancel')) {
              //close the dialog...
              return false;
            }
          },
          build: function() {
            Alertify.pgDialogBuild.apply(this);
          },
          prepare: function() {
            // Add our class to alertify
            $(this.elements.body.childNodes[0]).addClass(
              'alertify_tools_dialog_properties obj_properties'
            );

            /*
             If we already have data available in sqlite database then we should
             enable the debug button otherwise disable the debug button.
            */
            if (this.func_args_data.length == 0) {
              this.__internal.buttons[0].element.disabled = true;
            } else {
              this.__internal.buttons[0].element.disabled = false;
            }

            /*
             Listen to the grid change event so that if any value changed by user then we can enable/disable the
             debug button.
            */
            this.grid.listenTo(this.debuggerInputArgsColl, 'backgrid:edited',
                (function(obj) {

                  return function() {

                    var enable_btn = false;

                    for (var i = 0; i < this.collection.length; i++) {

                      if (this.collection.models[i].get('is_null')) {
                        obj.__internal.buttons[0].element.disabled = false;
                        enable_btn = true;
                        continue;
                      }
                      // TODO: Need to check the "Expression" column value to
                      // enable/disable the "Debug" button
                      if (this.collection.models[i].get('value') == '' ||
                        this.collection.models[i].get('value') == null ||
                        this.collection.models[i].get('value') == undefined) {
                        enable_btn = true;

                        if (this.collection.models[i].get('use_default')) {
                          obj.__internal.buttons[0].element.disabled = false;
                        } else {
                          obj.__internal.buttons[0].element.disabled = true;
                          break;
                        }
                      }
                    }
                    if (!enable_btn)
                      obj.__internal.buttons[0].element.disabled = false;
                  };
                })(this)
            );
          },
        };
      });
    }

    Alertify.debuggerInputArgsDialog(
      gettext('Debugger'), debug_info, restart_debug, is_edb_proc
    ).resizeTo('60%', '60%');

  };

  return res;
});
