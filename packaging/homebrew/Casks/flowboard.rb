cask "flowboard" do
  version "__VERSION__"
  sha256 "__MAC_DMG_SHA256__"

  url "https://github.com/divyaipratap/FlowBoard/releases/download/v#{version}/FlowBoard-#{version}.dmg",
      verified: "github.com/divyaipratap/FlowBoard/"
  name "FlowBoard"
  desc "Local-first project board and MCP bridge for AI coding agents"
  homepage "https://github.com/divyaipratap/FlowBoard"

  app "FlowBoard.app"

  zap trash: [
    "~/Library/Application Support/FlowBoard",
    "~/Library/Preferences/com.flowboard.app.plist",
    "~/Library/Saved Application State/com.flowboard.app.savedState",
  ]
end
