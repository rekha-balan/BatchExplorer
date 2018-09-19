import { SupportedEnvironments } from "@batch-flask/core/azure-environment";
import { log } from "@batch-flask/utils";
import { BatchExplorerApplication } from "client/core";
import { TelemetryManager } from "client/core/telemetry/telemetry-manager";
import { BrowserWindow, Menu, MenuItemConstructorOptions, app } from "electron";

function getEditMenu(app: BatchExplorerApplication, telemetryManager: TelemetryManager): MenuItemConstructorOptions {
    return {
        label: "Edit",
        submenu: [
            { role: "undo" },
            { role: "redo" },
            { type: "separator" },
            { role: "cut" },
            { role: "copy" },
            { role: "paste" },
            { role: "delete" },
            { role: "selectall" },
            { type: "separator" },
            {
                label: "Configure Proxy",
                click: () => {
                    app.proxySettings.configureManualy();
                },
            },
            {
                label: "Telemetry settings",
                submenu: [
                    {
                        label: "Enabled (Restart required)",
                        type: "radio",
                        checked: telemetryManager.telemetryEnabled,
                        click: () => {
                            telemetryManager.enableTelemetry();
                        },
                    },
                    {
                        label: "Disabled (Restart required)",
                        type: "radio",
                        checked: !telemetryManager.telemetryEnabled,
                        click: () => {
                            telemetryManager.disableTelemetry();
                        },
                    },
                ],
            },
        ],
    };
}

const viewMenu: MenuItemConstructorOptions = {
    label: "View",
    submenu: [{
        label: "Reload",
        accelerator: "CmdOrCtrl+R",
        click: (item, focusedWindow) => {
            if (focusedWindow) {
                // on reload, start fresh and close any old
                // open secondary windows
                if (focusedWindow.id === 1) {
                    BrowserWindow.getAllWindows().forEach((win) => {
                        if (win.id > 1) {
                            win.close();
                        }
                    });
                }
                focusedWindow.reload();
            }
        },
    }, {
        label: "Toggle Full Screen",
        accelerator: (() => {
            if (process.platform === "darwin") {
                return "Ctrl+Command+F";
            } else {
                return "F11";
            }
        })(),
        click: (item, focusedWindow) => {
            if (focusedWindow) {
                focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
            }
        },
    }, {
        label: "Toggle Developer Tools",
        accelerator: (() => {
            if (process.platform === "darwin") {
                return "Alt+Command+I";
            } else {
                return "Ctrl+Shift+I";
            }
        })(),
        click: (item, focusedWindow) => {
            if (focusedWindow) {
                (focusedWindow as any).toggleDevTools();
            }
        },
    }],
};

function getWindowMenu(batchExplorerApp: BatchExplorerApplication): MenuItemConstructorOptions {
    return {
        label: "Window",
        role: "window",
        submenu: [
            {
                label: "New Window",
                accelerator: "CmdOrCtrl+Shift+N",
                click: () => {
                    batchExplorerApp.openNewWindow();
                },
            },
            { role: "minimize" },
            { type: "separator" },
            { role: "close" },
        ],
    };
}

function environmentMenu(app: BatchExplorerApplication): MenuItemConstructorOptions {
    return {
        label: "Environment",
        submenu: [{
            label: "Azure Environment",
            submenu: Object.values(SupportedEnvironments).map((env): MenuItemConstructorOptions => {
                return {
                    label: env.name,
                    type: "radio",
                    checked: app.azureEnvironment.id === env.id,
                    click: () => app.updateAzureEnvironment(env).catch((error) => {
                        log.error("Error updating the azure environment", error);
                    }),
                };
            }),
        }],
    };
}

function setupOSXSpecificMenu(template) {
    if (process.platform === "darwin") {
        const name = app.getName();
        template.unshift({
            label: name,
            submenu: [
                {
                    label: `About ${name}`,
                    role: "about",
                }, {
                    type: "separator",
                }, {
                    label: "Services",
                    role: "services",
                    submenu: [],
                }, {
                    type: "separator",
                }, { role: "hide" },
                { role: "hideothers" },
                { role: "unhide" },
                { type: "separator" },
                { label: "Quit", accelerator: "Command+Q", click: () => app.quit() },
            ],
        });

        // Window menu.
        (template[2].submenu as any[]).push({
            type: "separator",
        }, {
                label: "Bring All to Front",
                role: "front",
            });

    }
}

export function setMenu(app: BatchExplorerApplication, telemetryManager: TelemetryManager) {
    const template = [
        getEditMenu(app, telemetryManager),
        viewMenu,
        getWindowMenu(app),
        environmentMenu(app),
    ];
    setupOSXSpecificMenu(template);
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}
