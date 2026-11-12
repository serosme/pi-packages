import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { execFile } from 'node:child_process'

const PS = [
  `$m=[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]`,
  `$x=$m::GetTemplateContent(1)`,
  `[void]$x.GetElementsByTagName('text').Item(0).AppendChild($x.CreateTextNode('Done.'))`,
  `$m::CreateToastNotifier('Pi').Show([Windows.UI.Notifications.ToastNotification]::new($x))`,
].join(';')

export default function (pi: ExtensionAPI) {
  pi.on('agent_settled', (event) => {
    if (event.aborted)
      return

    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        PS,
      ],
      { windowsHide: true },
      () => {},
    )
  })
}
