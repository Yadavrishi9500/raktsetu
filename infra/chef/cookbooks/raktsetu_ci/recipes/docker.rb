#
# Cookbook:: raktsetu_ci
# Recipe:: docker - Docker engine with bounded logs and weekly image pruning
#
package 'docker'

directory '/etc/docker' do
  mode '0755'
end

file '/etc/docker/daemon.json' do
  content(JSON.pretty_generate(
    'log-driver' => 'json-file',
    'log-opts' => { 'max-size' => '10m', 'max-file' => '3' },
    'live-restore' => true
  ))
  mode '0644'
  notifies :restart, 'service[docker]', :delayed
end

service 'docker' do
  action [:enable, :start]
end

cron 'docker-image-prune' do
  weekday '0'
  hour '3'
  minute '30'
  command 'docker image prune -af --filter "until=168h" >/dev/null 2>&1'
end
