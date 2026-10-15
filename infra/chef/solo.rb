# Chef Infra / Cinc Client local-mode config. No Chef Server needed.
base = File.expand_path(__dir__)
chef_repo_path  base
cookbook_path   [File.join(base, 'cookbooks')]
node_path       File.join(base, 'nodes')
file_cache_path File.join(base, 'local-mode-cache')
log_location    STDOUT
