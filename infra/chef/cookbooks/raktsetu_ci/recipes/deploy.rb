#
# Cookbook:: raktsetu_ci
# Recipe:: deploy - deploy user, source checkout, deploy command and auto-deploy timer
#
cfg  = node['raktsetu']
user_name = cfg['deploy_user']
src  = ::File.join(cfg['install_dir'], 'src')

raise 'Set node["raktsetu"]["ecr_repo_uri"] (see ./infra/aws/setup.sh outputs)' if cfg['ecr_repo_uri'].to_s.empty?

user user_name do
  comment 'RaktSetu deploy user'
  home "/home/#{user_name}"
  manage_home true
  shell '/bin/bash'
end

group 'docker' do
  members [user_name]
  append true
  action :modify
end

[cfg['install_dir'], cfg['state_dir']].each do |dir|
  directory dir do
    owner user_name
    group user_name
    mode '0755'
  end
end

directory cfg['log_dir'] do
  owner user_name
  group user_name
  mode '0755'
end

git src do
  repository cfg['repo_url']
  revision cfg['branch']
  user user_name
  group user_name
  action :checkout # first clone only; raktsetu-deploy fetches updates itself
end

directory '/etc/raktsetu' do
  mode '0755'
end

template '/etc/raktsetu/deploy.env' do
  source 'deploy.env.erb'
  owner 'root'
  group user_name
  mode '0640'
  variables(cfg: cfg)
end

template '/usr/local/bin/raktsetu-deploy' do
  source 'raktsetu-deploy.erb'
  mode '0755'
  variables(src: src, log_dir: cfg['log_dir'], state_dir: cfg['state_dir'])
end

systemd_unit 'raktsetu-deploy.service' do
  content(
    Unit: { Description: 'Build and deploy RaktSetu to Elastic Beanstalk if main has new commits', After: 'network-online.target docker.service', Wants: 'network-online.target' },
    Service: { Type: 'oneshot', User: user_name, Group: user_name, SupplementaryGroups: 'docker', ExecStart: '/usr/local/bin/raktsetu-deploy', TimeoutStartSec: '45min' }
  )
  action :create
end

systemd_unit 'raktsetu-deploy.timer' do
  content(
    Unit: { Description: 'Poll for new RaktSetu commits' },
    Timer: { OnBootSec: '3min', OnUnitActiveSec: cfg['poll_interval'], Persistent: true },
    Install: { WantedBy: 'timers.target' }
  )
  action cfg['auto_deploy'] ? [:create, :enable, :start] : [:create, :disable, :stop]
end
