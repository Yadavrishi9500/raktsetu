#
# Cookbook:: raktsetu_ci
# Recipe:: default
#
# Converges a fresh Amazon Linux 2023 EC2 instance into the RaktSetu build-and-deploy node.
# Re-running is safe and corrects any drift (Chef's whole point).
#
include_recipe 'raktsetu_ci::base'
include_recipe 'raktsetu_ci::docker'
include_recipe 'raktsetu_ci::deploy'
