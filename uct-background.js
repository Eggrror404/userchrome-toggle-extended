'use strict';

this.defaultSettings = {
    toggles: [{
            name: 'Style 1',
            enabled: true,
            prefix: '-',
            state: false
        },
        {
            name: 'Style 2',
            enabled: true,
            prefix: '=',
            state: false
        },
        {
            name: 'Style 3',
            enabled: true,
            prefix: '+',
            state: false
        },
        {
            name: 'Style 4',
            enabled: false,
            prefix: '?',
            state: false
        },
        {
            name: 'Style 5',
            enabled: false,
            prefix: '!',
            state: false
        },
        {
            name: 'Style 6',
            enabled: false,
            prefix: '/',
            state: false
        }
    ],
    general: {
        settingsVersion: 1.2,
        allowMultiple: false,
        notifyMe: false
    }
}


async function main() {
    await initializeSettings();
    await updateButtonStatus();
    await updateTitlePrefixes();

    // Always toggle style 1 on button click
    // This event will only fire when the button is not in pop-up mode
    browser.browserAction.onClicked.addListener(() => {
        userToggle(1)
    });

    // Trigger on registered hotkeys
    browser.commands.onCommand.addListener(userToggle);

    // Initialize new windows
    browser.windows.onCreated.addListener((window) => updateTitlePrefixes(window));

    console.log('Init complete');
}

// Update user settings to new defaults after updating the extension
async function updateSettings(settings) {
    if (settings.general.settingsVersion < defaultSettings.general.settingsVersion) {
        if (settings.general.settingsVersion < 1.2) {
            settings.general.notifyMe = defaultSettings.general.notifyMe;
        }

        settings.general.settingsVersion < defaultSettings.general.settingsVersion
        await browser.storage.local.set(settings);
    }

    return settings;
}

async function updateButtonStatus() {
    let settings = await browser.storage.local.get('toggles');

    // Use reduce function on array to count all enabled toggles
    let togglesEnabled = settings.toggles.reduce((count, toggle) => toggle.enabled ? count + 1 : count, 0);

    if (togglesEnabled < 2) {
        let toggle = settings.toggles[0];
        browser.browserAction.setTitle({
            title: `Turn ${toggle.name} ` + (toggle.state ? 'off' : 'on')
        });

        // Disable popup mode
        browser.browserAction.setPopup({ popup: null })
        console.log('Disabled popup mode');
    } else {
        browser.browserAction.setTitle({
            title: 'Show userchrome toggles'
        });

        // Enable popup mode
        browser.browserAction.setPopup({ popup: "popup/popup.html" })
        console.log('Enabled popup mode', togglesEnabled);
    }
}

async function getStyleSettings(styleId) {
    let settings = await browser.storage.local.get('toggles');
    return settings.toggles[styleId - 1].prefix;
}

async function initializeSettings() {
    let settings = await browser.storage.local.get();
    if (settings.toggles) {
        console.log('Loading user settings', settings);
        settings = await updateSettings(settings);
    } else {
        console.log('Initializing default settings', defaultSettings);

        await browser.storage.local.set(defaultSettings);

        // Open settings page for the user
        browser.runtime.openOptionsPage();
    }

}

// Detect current window title prefix to allow toggling
async function toggleTitlePrefix(windowId, titlePrefix) {
    const windowInfo = await browser.windows.get(windowId.id);

    if (windowInfo.title && windowInfo.title.startsWith(titlePrefix))
        titlePrefix = '';

    return setTitlePrefix(windowId, titlePrefix);
}

// Update prefix for specified window
async function updateTitlePrefixes(windowId) {
    // Default to current window
    windowId ??= await browser.windows.getCurrent();

    const settings = await browser.storage.local.get(['toggles', 'general']);
    const toggles = settings.toggles;
    let titlePrefix = '';

    // Loop through all toggles
    for (let i = 0; i < toggles.length; i++) {
        if (toggles[i].state) {
            titlePrefix += String(toggles[i].prefix);

            // When only one toggle may be active at once, stop after the first
            if (!settings.general.allowMultiple)
                break;
        }
    }

    browser.windows.update(windowId.id, {
        titlePreface: titlePrefix
    });
}

// Respond to button clicks and registered hotkeys
async function userToggle(styleId, newState) {
    // Extract style number from end of string
    styleId = String(styleId).match(/[0-9]+$/);

    let settings = await browser.storage.local.get(['toggles', 'general']);
    let hrState = 'off';
    let toggle = { name: 'all styles' }

    if (styleId && !settings.toggles[styleId[0] - 1].enabled) {
        console.log('Style is disabled', settings.toggles[styleId[0] - 1]);
        return
    }

    // When only one option allowed or no valid style is selected, reset all others
    // Also do this when no valid style has been found
    if (!settings.general.allowMultiple || !styleId) {
        for (let i = 0; i < settings.toggles.length; i++) {
            if (!styleId || styleId[0] - 1 != i)
                settings.toggles[i].state = false;
        }
    }

    // When valid style has been selected
    if (styleId) {
        styleId = styleId[0];
        // Invert toggle state or set requested state and save in settings
        toggle = settings.toggles[styleId - 1];

        newState = !toggle.state;

        settings.toggles[styleId - 1].state = newState;

        if (newState)
            hrState = 'on';
    }

    // Generate user notification when enabled
    console.log('Toggling', styleId, hrState);
    if (settings.general.notifyMe) {
        browser.notifications.create(`toggle-${styleId}`, {
            type: "basic",
            title: "Userchrome style toggle",
            message: `Turned ${toggle.name} ${hrState}`
        });
    }

    await browser.storage.local.set(settings);

    // Update title to reflect new truth
    updateTitlePrefixes();
    updateButtonStatus();
}

function handleMessage(message, sender, sendResponse) {
    if (message.type == 'toggle') {
        userToggle(message.id, message.state);
    }

    if (message.type == 'updButtonStatus') {
        updateButtonStatus();
    }

    if (message.type == 'getDefaults') {
        sendResponse({
            content: defaultSettings
        });
    }
}

browser.runtime.onMessage.addListener(handleMessage);

main();
