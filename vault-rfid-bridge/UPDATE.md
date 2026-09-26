# Update the print bridge on the shop computer

The bridge is the program in the `vault-rfid-bridge` folder. A command window on the shop computer stays open running it. That folder already has a `config.json` with the Vault address, the bridge key, and the printer IP. Do not replace `config.json`.

This is not a Windows service. Closing the window stops printing.

## Update

1. On the shop computer, open the `vault-rfid-bridge` folder. It is the folder that already contains `config.json`.
2. Click the window where the bridge is running. Press Ctrl+C, and wait until it stops. Leave the window open.
3. Get the new files. If this folder was installed with git, run `git pull`. If the files were copied onto the computer, copy the new `vault-rfid-bridge` files over the old ones. Do not overwrite `config.json`.
4. In that same window, run `npm install`.
5. Run `npm run build`.
6. Run `npm start`.
7. Wait until you see `Vault RFID Bridge starting` and a printer check report. Leave this window open.

Each time the bridge starts it also runs the printer check by itself and sends the result to Vault.

## Run the printer check

1. Open a second command window in the same `vault-rfid-bridge` folder. Leave the bridge window running.
2. Run `npm run printer-check`.
3. Read the report in that window. The same report is sent to Vault, and it shows in Settings, Stocktake & RFID, under the printer.

You can also run `npm start -- --printer-check` after `npm run build`. That runs the check and exits. It does not start printing. `npm run printer-check` is the one to use day to day.

## What good looks like

- Firmware shows a name, not `(no reply)`.
- Head DPI is `300` or `203`.
- Clock says `OK`.
- The last line says `Posted to Vault`.
- In Vault, under the printer, Firmware, DPI, Clock, Weblink configured, and Cert files are filled in.

Weblink configured can say `no` until a relay address is put on the printer later. That is still a good check. Cert files may list `WEBLINK1_CA.NRD`. Port 443 says skipped. That is expected.

If Firmware and Head DPI both say `(no reply)`, the computer did not get an answer from the printer. Check the printer is on, and that `printer.host` in `config.json` is the printer's IP. The check only asks the printer questions. It does not change printer settings.
