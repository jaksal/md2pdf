md2pdf
======

make pdf file from md file 

1. install node , lib.
```
  sudo su -
  curl --silent --location https://rpm.nodesource.com/setup_6.x | bash -
  yum -y install nodejs
  yum -y install gcc-c++ make
  yum -y install fontconfig libfontconfig.so.1 unzip wget nano
  exit
```  
2. install google fonts
```
  wget https://github.com/google/fonts/archive/master.zip
  unzip master.zip
  cp -R ./fonts-master/apache/opensans ~/.fonts
  cp -R ./fonts-master/ufl/ubuntumono/ ~/.fonts
  fc-cache -f -v
```

3. download source, goto source directory
```
  git clone https://github.com/jaksal/md2pdf.git
  cd md2pdf
  npm install
```  
4. convert md to pdf
```
  node index.js -i result.md -o result.pdf
```
  
