'use strict';
import * as React from 'react';
import client from '../../../js/slycat-web-client';
import ProgressBar from 'components/ProgressBar.tsx';
import {LoadingPageProps, LoadingPageState} from './types';
import ConnectModal from 'components/ConnectModal.tsx';
import ControlsButton from 'components/ControlsButton';
import Spinner from 'components/Spinner.tsx';
import {JobCodes} from './JobCodes.tsx'
/**
 * react component used to create a loading page
 *
 * @export
 * @class LoadingPage
 * @extends {React.Component<LoadingPageProps, LoadingPageState>}
 */
export default class LoadingPage extends React.Component<LoadingPageProps, LoadingPageState> {
  timer: any; //NodeJS.Timeout
  progressTimer: any;
  TIMER_MS: number = 10000;
  public constructor(props:LoadingPageProps) {
    super(props)
    this.state = {
      modelState: this.props.modelState,
      sessionExists: false,
      progressBarHidden: false,
      modalId: 'ConnectModal',
      progressBarProgress: 0,
      modelMessage: '',
      modelShow: false,
      pullCalled: 0,
      jobStatus: 'Job Status Unknown',
      log: {
        logLineArray: [] as any,// [string]
      },
      modelId: props.modelId
    }
  }
  /**
   * method runs after the component output has been rendered to the DOM
   */
  componentDidMount() {
    this.checkRemoteStatus().then(() => {
      if(this.state.sessionExists) {
        this.checkRemoteJob();
      }
    });
    this.timer = setInterval(()=> this.checkRemoteStatus(), this.TIMER_MS);
    this.progressTimer = setInterval(()=> this.updateProgress(), 3000);
  }

  // tear down
  componentWillUnmount() {
    clearInterval(this.timer);
    clearInterval(this.progressTimer);
    this.timer = null;
    this.progressTimer = null;
  }
  private updateProgress = () => {
    client.get_model_fetch(this.props.modelId).then((model: any) => {
      if (model.hasOwnProperty('progress') && model.hasOwnProperty('state')){
        this.setState({progressBarProgress:model.progress, modelState:model.state}, () => {
          if(this.state.progressBarProgress === 100){
            window.location.reload(true);
          }
        });
      }
    }).catch((err:any)=>{
      alert(`error retrieving the model ${err}`)
    })
  }
  private connectModalCallBack = (sessionExists: boolean, loadingData: boolean) => {
    this.setState({sessionExists},() => {
      if(this.state.sessionExists) {
        this.checkRemoteJob();
      }
    })
    clearInterval(this.timer);
    this.timer = null;
    console.log(`Callback Called sessionExists:${sessionExists}: loadingData:${loadingData}`);
  }
  private pullHPCData = () => {
    const params = {mid:this.props.modelId, type:"timeseries", command: "pull_data"}
    client.get_model_command_fetch(params).then((json: any) => {
      console.log(json)
    }).catch((res: any)=> {
      if((res as string).includes('409 :: error connecting to check on the job')){
        this.checkRemoteStatus()
      } else{
        window.alert(res);
      }

    });
  };
  /**
   * function used to test if we have an ssh connection to the hostname
   * @param hostname name of the host we want to connect to
   * @async
   * @memberof SlycatRemoteControls
   */
  private checkRemoteJob = async () => {
    return client.get_checkjob_fetch(this.props.hostname, this.props.jid)
      .then((json:any) => {
        console.log(json);
        this.appendLog(json);
    });
  };
  
  private appendLog = (resJson: any) => {
    this.state.log.logLineArray = resJson.logFile.split("\n")
    this.setState({
      jobStatus: `Job Status: ${resJson.status.state}`,
      log : this.state.log,
    });
    switch (resJson.status.state) {
      case 'COMPLETED':
        if(this.state.pullCalled<3){
          this.setState({ pullCalled: 3 }, () => this.pullHPCData());
        }
        break;
      case 'RUNNING':
        if(this.state.pullCalled<2){
          this.setState({ pullCalled: 2 }, () => this.pullHPCData());
        }
        break;
      case "PENDING":
        if(this.state.pullCalled<1){
          this.setState({ pullCalled: 1 }, () => this.pullHPCData());
        }
        break;
      default:
        console.log("Unknown state");
        break;
  }
  }

  /**
   * function used to test if we have an ssh connection to the hostname
   * @param hostname name of the host we want to connect to
   * @async
   * @memberof SlycatRemoteControls
   */
  private checkRemoteStatus = async () => {
    return client.get_remotes_fetch(this.props.hostname)
    .then((json: any) => {
      this.setState({
        sessionExists: json.status
      }, () => {
        if (!this.state.sessionExists) {
          this.setState({ modelShow: true });
          ($(`#${this.state.modalId}`) as any).modal('show');
        } else if(this.state.progressBarProgress < 50){
          this.checkRemoteJob();
        }
      });
    });
  }

  private loginModal = () => {
    return (
      <div>
        <ConnectModal
          hostname = {this.props.hostname}
          modalId = {this.state.modalId}
          callBack = {this.connectModalCallBack}
        />
        {this.state.modelShow&&!this.state.sessionExists?<ControlsButton 
          label='Connect' 
          title={'Connect button'} 
          data_toggle='modal' 
          data_target={'#' + this.state.modalId}
          button_style={'btn-primary float-right'} id='controls-button-death'
        />:null}
          <button
          className={`btn btn-md btn-primary`}
          id={'pullbtn'}
          type='button' 
          title={'load data'}
          disabled={!this.state.jobStatus.includes('COMPLETED')}
          onClick={() => this.pullHPCData()} >
          {'load'}
          </button>
      </div>

    );
  }

  private logBuilder = (itemList:[string]) => {
    return itemList.map((item, index) =>
      <dd key={index.toString()}>
        {JSON.stringify(item)}
      </dd>
    );
  }

  private getLog = ()  =>  {
    let items: [] = this.logBuilder(this.state.log.logLineArray) as any;
    return this.state.sessionExists?(
      <dl>
        <dt>
          > {this.state.jobStatus}
        </dt>
        <dt>
          > Slurm run Log:
        </dt>
          {items.length>=1?items:<Spinner />}
      </dl>
    ):(<Spinner />);
  }
  public render() {
    let d = new Date();
    let datestring = d.getDate()  + "-" + (d.getMonth()+1) + "-" + d.getFullYear() + " " +
      d.getHours() + ":" + d.getMinutes() + ":" + d.getSeconds();

    return (
      <div className="slycat-job-checker bootstrap-styles">
        <div>
        <ProgressBar
          hidden={this.state.progressBarHidden}
          progress={this.state.progressBarProgress}
        />
        </div>
        <div className='slycat-job-checker-controls'>
          <div className="row">
            <div className="col-3">Updated {datestring}</div>
            <div className="col-2">Job id: <b>{this.props.jid}</b></div>
            <div className="col-3">Remote host: <b>{this.props.hostname}</b></div>
            <div className="col-2">Session: <b>{this.state.sessionExists?'true':'false'}</b></div>
            <div className="col-2">{this.loginModal()}</div>
          </div>
          <div className="row">
            <button className="btn btn-primary" type="button" data-toggle="collapse" data-target="#collapseExample" aria-expanded="false" aria-controls="collapseExample">
              Show job status meanings
            </button>
            <JobCodes/>
          </div>
        </div>
        <div className="slycat-job-checker-output text-white bg-secondary" >
          {this.getLog()}
        </div>
      </div>
    );
  }
}