#
# Cookbook:: raktsetu_ci
# Recipe:: base - packages, time sync, SSH hardening, automatic security updates, log rotation
#
cfg = node['raktsetu']

package %w(git zip unzip jq tar cronie chrony logrotate awscli-2 dnf-automatic)

%w(chronyd crond).each do |svc|
  service svc do
    action [:enable, :start]
  end
end

service 'sshd' do
  action :nothing
end

template '/etc/ssh/sshd_config.d/90-raktsetu.conf' do
  source 'sshd_hardening.conf.erb'
  owner 'root'
  group 'root'
  mode '0600'
  variables(ssh: cfg['ssh'])
  notifies :restart, 'service[sshd]', :delayed
end

template '/etc/dnf/automatic.conf' do
  source 'dnf-automatic.conf.erb'
  mode '0644'
  only_if { cfg['security_updates'] }
end

service 'dnf-automatic.timer' do
  action cfg['security_updates'] ? [:enable, :start] : [:disable, :stop]
end

directory cfg['log_dir'] do
  mode '0755'
end

template '/etc/logrotate.d/raktsetu' do
  source 'logrotate.erb'
  mode '0644'
  variables(log_dir: cfg['log_dir'], user: cfg['deploy_user'])
end
