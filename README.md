# chaingeStanford
Onboard Stanford students to Chainge


## Step by step guide for running chaingeStanford on Docker

1. Download and install docker. You may need to reboot your computer to run docker daemon.
1. Download the docker image by 
    ```
      docker pull jblee94/chainge:1
    ```
1. Run the docker image by 
    ```
      docker run -p 3333:3333 --add-host="localhost:<YOUR HOST IP ADDRESS>" -it jblee94/chainge:1 /bin/bash
    ```
    This binds the host's port 3333 to container's 3333. This will log you into the docker image as root.
1. Run the redis server
      ```
        service redis-server start
      ```
1. Run our txn calculator
    ```
      /home/chaingeStanford/crypto/main
    ```
    You may need to run it as a background process (by appending & at the command). But you can also run another terminal process by
    ```
      docker exec -i -t <YOUR DOCKER INSTANCE ID> /bin/bash
    ```

    You can check your docker instance id by
    ```
      docker ps
    ```
1. Go to config.js and set your id and password for nodemailer service. You can use your gmail account. 
1. Change directories to home and then chaingeStanford, then run ```npm start``` to run the server.
