# Aller dans chaque dossier et suivre les instructions pour installer les APP

# Une fois tout bien installe 

#  ---- Lancer le projet simple ----
# Dans node_server lancer node server.js
# Dans proxy_envoy lancer envoy -c envoy.yaml
# Dans node_client_simple lancer python3 -m http.server 3000

#  ---- Lancer web_app client nodejs avec serveur python ----
# Dans python_server lancer python server.py
# Dans proxy_envoy lancer envoy -c envoy.yaml
# Dans web_app_client lancer npm run server pour la prod ou npm start pour dev


# pour application pts faire pareil mais avec web_app_client_pts et python_server_pts

# pour application slam faire pareil mais avec les dossiers extensions _slam
# soit on gen les points avec le dossier python_client_source soir on gen les points direct avec un slam offline



# app_grpc_web


# Conclusion CHATGPT
Gains en termes de latence :

    Exposer directement le client web sur le PC distant est plus simple et peut sembler plus performant en termes de latence si vous avez une bonne connexion réseau entre le client distant et le serveur local. Cependant, les interactions ne sont pas aussi fluides qu'elles pourraient l'être, car les mises à jour de la scène sont envoyées via HTTP/WebSocket, qui sont généralement plus lents que les canaux bidirectionnels de WebRTC.

    WebRTC peut offrir une latence significativement plus faible, surtout pour les interactions en temps réel. Les données de la scène 3D sont envoyées en continu via un flux vidéo, tandis que les événements utilisateur sont envoyés par un canal de données WebRTC, permettant des mises à jour presque instantanées. Cela est particulièrement important pour des applications interactives comme Three.js, où une réponse immédiate est attendue de la scène 3D.

Quand WebRTC est-il un véritable gain de latence ?

    Si vous avez une bande passante stable et faible latence sur le réseau local, la différence entre les deux méthodes peut ne pas être énorme. Cependant, lorsque vous utilisez WebRTC, les canaux de communication bidirectionnels assurent que les interactions (clique, défilement de la souris) se produisent de manière beaucoup plus rapide et réactive.

    Si votre connexion réseau n'est pas idéale, WebRTC peut offrir un avantage significatif, car il peut mieux gérer la latence et la transmission continue de flux vidéo de manière plus optimisée par rapport à une simple solution HTTP/WebSocket.

Conclusion

    Simplicité vs performance : Si vous souhaitez une solution simple avec un compromis raisonnable sur la latence, exposer le client web est plus facile à mettre en place. Cependant, si l'interactivité et la fluidité en temps réel sont cruciales (comme dans le cas d'une scène Three.js très interactive), WebRTC peut offrir des gains de latence significatifs malgré sa complexité de mise en œuvre.

    À évaluer : Il est important de tester les deux approches dans votre environnement réseau pour évaluer la latence et l'interactivité en fonction des ressources disponibles, et choisir la méthode qui correspond le mieux à vos exigences.
