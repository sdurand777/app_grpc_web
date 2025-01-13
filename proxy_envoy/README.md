# installer envoy
./install_envoy.sh

# checker la version pour verifier install
envoy --version

# lancer proxy
envoy -c envoy.yaml
