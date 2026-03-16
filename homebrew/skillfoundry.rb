# typed: false
# frozen_string_literal: true

class Skillfoundry < Formula
  desc "AI engineering framework with quality gates"
  homepage "https://github.com/samibs/skillfoundry"
  url "https://github.com/samibs/skillfoundry/archive/refs/tags/v#{version}.tar.gz"
  version "2.0.52"
  # Update SHA after release: shasum -a 256 v2.0.52.tar.gz
  sha256 "PLACEHOLDER_UPDATE_SHA256_AFTER_RELEASE"
  license "MIT"

  depends_on "node@20"

  def install
    system "npm", "install", "--production"
    libexec.install Dir["*"]

    # Create wrapper script that sets NODE_PATH and executes the CLI
    (bin/"skillfoundry").write <<~EOS
      #!/bin/bash
      exec "#{Formula["node@20"].opt_bin}/node" "#{libexec}/sf_cli/dist/index.js" "$@"
    EOS

    # Create sf alias
    bin.install_symlink "skillfoundry" => "sf"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/skillfoundry --version")
  end
end
