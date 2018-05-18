# Chrome Tabber Project

This repository contains the open source project Chrome Tabber.

This project uses the Apache license.

## What does Chrome Tabber Do?

Chrome Tabber allows you to share your browser tabs across devices very simply,
using your Google account.

By default, when you open the Chrome browser, the tabs are initialized to the
same state as when you closed the browser *on that device.*

Although there is a setting that lets you change that behavior, you cannot
easily restore tabs from another device. The official way to do that in Chrome
is to save your current tabs as a group bookmark (*"Bookmark Open Pages..."*)
and then open that bookmark on another device.

Chrome Tabber lets you instantly sync your tabs across Chrome browsers on any
device logged into your Google account. It provides several modes of operation
so you can customize this behavior to fit your needs.

## How to use Chrome Tabber

After installing Chrome Tabber it will display a little icon in Chrome's
extension icon area (typically the upper right of the browser). Click this icon
in order see Chrome Tabber's popup UI.

On Tabber's popup, you can see status, perform manual syncing, or change the
mode of operation. The mode of operation is persistent, and applies to the
*current device* only. That means you can set different modes on different
devices (which is a useful and typical way to set up your devices).

### Chrome Tabber Modes

*   Manual: Just like it sounds, in order to save or load tabs, you must click a
    button on Tabber's popup UI.

*   Startup Only: Your saved tabs are loaded only when the browser is opened.

*   Auto-Save: Like *Startup Only* but any changes you make on this device are
    saved for sharing to other devices.

*   Fully Automatic: Like Auto-Save but Chrome Tabber will also detect changes
    made on other devices and automatically load them.

By setting various modes on your devices, you can support different use cases.
Here are some common scenarios:

QUESTION: I have one main device and multiple secondary devices. How do I set up
Chrome Tabber so that whenever I start Chrome on a secondary device, it opens
with the same tabs I last used on my main device?

ANSWER: Set your main device to *Auto-Save* and secondary devices to *Startup
Only.* With this setup, subsequent tabs that you open or close on your secondary
devices do not get reflected back to your main device.

QUESTION: I have several devices I use. How do I make it so they all show the
same tabs all the time?

ANSWER: Set all devices to *Fully Automatic*

QUESTION: I use one device almost all the time, but occasionally I do some work
on another device. How do I make it so that I can move from device to device,
and always 'pick up where I left off?'

ANSWER: There are several ways to do this:

1.  Set all devices to *Fully Automatic*

1.  Set main device to *Fully Automatic* and secondary devices to *Auto-Save*

1.  Use manual save and load operations to 'move' your work whenever you like.

Best Practice: Set main device to *Fully Automatic* and secondary devices to
*Startup Only.* Once you are done working on the secondary device, manually
click the "Save the Tabs I have Now" button.

# NOTE
This is not an official Google product.
