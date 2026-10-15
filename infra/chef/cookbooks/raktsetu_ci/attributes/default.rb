# Source of truth for the app being deployed
default['raktsetu']['repo_url']      = 'https://github.com/your-username/raktsetu.git'
default['raktsetu']['branch']        = 'main'

# Where things live on the node
default['raktsetu']['deploy_user']   = 'deploy'
default['raktsetu']['install_dir']   = '/opt/raktsetu'
default['raktsetu']['log_dir']       = '/var/log/raktsetu'
default['raktsetu']['state_dir']     = '/var/lib/raktsetu'

# AWS targets (fill from `./infra/aws/setup.sh outputs`)
default['raktsetu']['aws_region']    = 'ap-south-1'
default['raktsetu']['ecr_repo_uri']  = ''
default['raktsetu']['eb_app']        = 'raktsetu'
default['raktsetu']['eb_web_env']    = 'raktsetu-web'
default['raktsetu']['eb_worker_env'] = 'raktsetu-worker'

# Poll git and deploy new commits automatically (a pull-based CI with no webhook to expose)
default['raktsetu']['auto_deploy']   = true
default['raktsetu']['poll_interval'] = '5min'

# Baseline hardening
default['raktsetu']['ssh']['permit_root_login']       = 'no'
default['raktsetu']['ssh']['password_authentication'] = 'no'
default['raktsetu']['ssh']['max_auth_tries']          = 3
default['raktsetu']['security_updates']               = true
